import type { NextApiRequest, NextApiResponse } from 'next';

// sanitize helpers
const norm = (s: string) => (s || '').replace(/\s+/g, '').replace(/[\r\n]/g, '');

// service-role headers
const SB_URL = process.env.SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const SR_HEADERS = {
  apikey: SB_KEY,
  Authorization: `Bearer ${SB_KEY}`,
  'content-type': 'application/json',
};

async function getOrCreateLead(account_id: string, phone: string, name?: string): Promise<string> {
  const qs = new URLSearchParams({ select: 'id', limit: '1' });
  qs.append('account_id', `eq.${account_id}`);
  qs.append('phone', `eq.${phone}`);

  const r1 = await fetch(`${SB_URL}/rest/v1/leads?${qs.toString()}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  const r1Text = await r1.text();
  let rows1: any = [];
  try {
    rows1 = JSON.parse(r1Text);
  } catch {}
  if (Array.isArray(rows1) && rows1[0]?.id) return rows1[0].id as string;

  const r2 = await fetch(`${SB_URL}/rest/v1/leads?on_conflict=phone`, {
    method: 'POST',
    headers: { ...SR_HEADERS, Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify([
      {
        account_id,
        phone,
        name: name || phone,
        status: 'active',
      },
    ]),
  });
  const r2Text = await r2.text();
  let rows2: any = [];
  try {
    rows2 = JSON.parse(r2Text);
  } catch {}
  if (!Array.isArray(rows2) || !rows2[0]?.id) {
    throw new Error(`LEAD_UPSERT_FAILED ${r2.status} ${r2Text}`);
  }
  return rows2[0].id as string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const DEFAULT_ACCOUNT_ID = process.env.DEFAULT_ACCOUNT_ID!;
    const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim();
    const OPENAI_MODEL = (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();
    const INTERNAL_API_SECRET = (process.env.INTERNAL_API_SECRET || '').trim();
    const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || '').trim();

    const from = norm(req.body?.From as string);
    const to = norm(req.body?.To as string);

    if (!from || !to) {
      throw new Error('missing required phone numbers');
    }

    // 1) Resolve account_id by 'to' number (your Twilio number)
    let account_id = DEFAULT_ACCOUNT_ID;
    try {
      const rAcct = await fetch(
        `${SB_URL}/rest/v1/account_settings?select=account_id,phone_from&phone_from=eq.${encodeURIComponent(to)}&limit=1`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } },
      );
      const acctText = await rAcct.text();
      let rows: any = [];
      try {
        rows = JSON.parse(acctText);
      } catch {}
      if (Array.isArray(rows) && rows[0]?.account_id) account_id = rows[0].account_id;
      console.log('ACCOUNT_RESOLVE', { to, account_id, status: rAcct.status, body: acctText });
    } catch (e) {
      console.log('ACCOUNT_RESOLVE_ERROR', String(e));
    }

    // 2) Build prompt and get AI reply (use your existing draft endpoint or OpenAI)
    const inboundBody = (req.body?.Body as string) || '';
    let aiText = 'Thanks—message received.'; // fallback
    try {
      if (INTERNAL_API_SECRET && PUBLIC_BASE_URL) {
        const rDraft = await fetch(`${PUBLIC_BASE_URL}/api/internal/knowledge/draft`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-internal-secret': INTERNAL_API_SECRET,
          },
          body: JSON.stringify({ account_id, q: inboundBody }),
        });
        const draftText = await rDraft.text();
        let dj: any = {};
        try {
          dj = JSON.parse(draftText);
        } catch {}
        const candidate =
          dj?.reply ?? dj?.text ?? dj?.draft?.text ?? dj?.draft ?? dj?.message ?? '';
        const drafted = typeof candidate === 'string' ? candidate.trim() : '';
        if (drafted) aiText = drafted;
        console.log('INBOUND_AI_DRAFT', rDraft.status, draftText);
      } else if (OPENAI_API_KEY) {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            Authorization: `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: OPENAI_MODEL,
            messages: [
              {
                role: 'system',
                content:
                  'You are an SMS sales assistant for OutboundRevive. Be concise, friendly, and helpful. Offer to share pricing succinctly and propose a quick call when relevant.',
              },
              { role: 'user', content: inboundBody || 'Hello' },
            ],
          }),
        });
        const respText = await r.text();
        let jj: any = {};
        try {
          jj = JSON.parse(respText);
        } catch {}
        const ai = jj?.choices?.[0]?.message?.content?.trim();
        if (ai) aiText = ai;
        console.log('INBOUND_AI_FALLBACK', r.status, respText);
      }
    } catch (e) {
      console.log('INBOUND_AI_ERROR', String(e));
    }

    // 3) Ensure lead exists then persist to messages_out
    try {
      const leadName = (req.body?.ProfileName as string) || undefined;
      const lead_id = await getOrCreateLead(account_id, from, leadName);

      const rIns = await fetch(`${SB_URL}/rest/v1/messages_out`, {
        method: 'POST',
        headers: { ...SR_HEADERS, Prefer: 'return=representation' },
        body: JSON.stringify([
          {
            account_id,
            lead_id,
            to_phone: from,
            from_phone: to,
            body: aiText,
            status: 'queued',
            provider: 'twilio',
            source: 'ai',
          },
        ]),
      });

      const insText = await rIns.text();
      console.log('OUTBOUND_INSERT', rIns.status, insText);
      if (rIns.status !== 201) throw new Error(`messages_out insert failed: ${rIns.status} ${insText}`);

      let insJson: any = undefined;
      try {
        insJson = JSON.parse(insText);
      } catch {}
      console.log('OUTBOUND_INSERT_PARSED', Array.isArray(insJson) ? insJson[0] : insJson);
    } catch (e) {
      console.log('OUTBOUND_INSERT_ERROR', String(e));
      throw e;
    }

    // 4) Return TwiML with AI message
    res.setHeader('Content-Type', 'text/xml');
    res
      .status(200)
      .send(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${aiText
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')}</Message></Response>`,
      );
  } catch (e: any) {
    console.log('WEBHOOK_FATAL', String(e?.stack || e));
    res.setHeader('Content-Type', 'text/xml');
    res
      .status(200)
      .send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>Thanks—message received.</Message></Response>`);
  }
}
