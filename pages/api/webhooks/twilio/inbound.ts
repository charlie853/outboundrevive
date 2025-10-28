import type { NextApiRequest, NextApiResponse } from 'next';

const norm = (s: string) => (s || '').replace(/\s+/g, '').replace(/[\r\n]/g, '');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const SB_URL = process.env.SUPABASE_URL!;
    const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const DEFAULT_ACCOUNT_ID = process.env.DEFAULT_ACCOUNT_ID!;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;

    const from = norm(req.body?.From as string);
    const to = norm(req.body?.To as string);

    // 1) Resolve account_id by 'to' number (your Twilio number)
    let account_id = DEFAULT_ACCOUNT_ID;
    try {
      const rAcct = await fetch(
        `${SB_URL}/rest/v1/account_settings?select=account_id,phone_from&phone_from=eq.${encodeURIComponent(to)}&limit=1`,
        {
          headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
        },
      );
      const rows = await rAcct.json().catch(() => []);
      if (Array.isArray(rows) && rows[0]?.account_id) account_id = rows[0].account_id;
      console.log('ACCOUNT_RESOLVE', { to, account_id, status: rAcct.status });
    } catch (e) {
      console.log('ACCOUNT_RESOLVE_ERROR', String(e));
    }

    // 2) Build prompt and get AI reply (use your existing draft endpoint or OpenAI)
    const body = (req.body?.Body as string) || '';
    let aiText = 'Thanks—message received.'; // fallback
    try {
      // Prefer your internal draft endpoint if present:
      const secret = process.env.INTERNAL_API_SECRET;
      if (secret) {
        const rDraft = await fetch(`${process.env.PUBLIC_BASE_URL}/api/internal/knowledge/draft`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-internal-secret': secret },
          body: JSON.stringify({ account_id, q: body }),
        });
        const dj = await rDraft.json();
        if (dj?.reply) aiText = dj.reply;
        console.log('INBOUND_AI_DRAFT', rDraft.status, dj);
      } else {
        // Lightweight OpenAI fallback
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'content-type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
          body: JSON.stringify({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content:
                  'You are an SMS sales assistant for OutboundRevive. Be concise, friendly, and helpful. Offer to share pricing succinctly and propose a quick call when relevant.',
              },
              { role: 'user', content: body || 'Hello' },
            ],
          }),
        });
        const jj = await r.json();
        aiText = jj?.choices?.[0]?.message?.content?.trim() || aiText;
        console.log('INBOUND_AI_FALLBACK', r.status);
      }
    } catch (e) {
      console.log('INBOUND_AI_ERROR', String(e));
    }

    // 3) Persist to messages_out
    try {
      const rIns = await fetch(`${SB_URL}/rest/v1/messages_out`, {
        method: 'POST',
        headers: {
          apikey: SB_KEY,
          Authorization: `Bearer ${SB_KEY}`,
          'content-type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify([
          {
            account_id,
            to_phone: from,
            from_phone: to,
            body: aiText,
            status: 'queued',
          },
        ]),
      });

      const insText = await rIns.text();
      console.log('OUTBOUND_INSERT', rIns.status, insText);

      if (rIns.status !== 201) {
        throw new Error(`messages_out insert failed: ${rIns.status} ${insText}`);
      }

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
