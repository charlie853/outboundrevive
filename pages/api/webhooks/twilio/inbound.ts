import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// sanitize helpers
const norm = (s: string) => (s || '').replace(/\s+/g, '').replace(/[\r\n]/g, '');

// service-role headers
const SB_URL = process.env.SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const DEFAULT_ACCOUNT_ID = process.env.DEFAULT_ACCOUNT_ID!;
    const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim();
    const OPENAI_MODEL = (process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();
    const INTERNAL_API_SECRET = (process.env.INTERNAL_API_SECRET || '').trim();

    const from = norm(req.body?.From as string);
    const to = norm(req.body?.To as string);

    if (!from || !to) {
      throw new Error('missing required phone numbers');
    }

    // 1) Resolve account_id by 'to' number (your Twilio number)
    let accountId = DEFAULT_ACCOUNT_ID;
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
      if (Array.isArray(rows) && rows[0]?.account_id) accountId = rows[0].account_id;
      console.log('ACCOUNT_RESOLVE', { to, account_id: accountId, status: rAcct.status, body: acctText });
    } catch (e) {
      console.log('ACCOUNT_RESOLVE_ERROR', String(e));
    }

    // 2) Build prompt and get AI reply (use your existing draft endpoint or OpenAI)
    const inboundBody = String(req.body?.Body ?? '').trim();
    let replyText = '';
    const deploymentHost = (req.headers['x-vercel-deployment-url'] as string) || (req.headers.host as string) || '';
    const base = process.env.PUBLIC_BASE_URL?.trim() || (deploymentHost ? `https://${deploymentHost}` : '');

    const askDraft = async () => {
      try {
        const dr = await fetch(`${base}/api/internal/knowledge/draft`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-internal-secret': INTERNAL_API_SECRET,
          },
          body: JSON.stringify({ account_id: accountId, q: inboundBody }),
          cache: 'no-store',
        });

        if (dr.ok) {
          const j = await dr.json();
          if (j?.reply && typeof j.reply === 'string' && j.reply.trim().length > 0) {
            replyText = j.reply.trim();
            console.log('DRAFT_CALL_OK');
          } else {
            console.error('DRAFT_CALL_EMPTY');
          }
        } else {
          console.error('DRAFT_CALL_FAIL', { status: dr.status, text: await dr.text() });
        }
      } catch (e) {
        console.error('DRAFT_CALL_ERR', e);
      }
    };

    if (base) await askDraft();
    else console.error('DRAFT_CALL_SKIP_NO_BASE');

    try {
      if (!replyText && OPENAI_API_KEY) {
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
        if (ai) {
          replyText = ai;
          console.log('OPENAI_FALLBACK_OK');
        } else {
          console.error('OPENAI_FALLBACK_EMPTY', respText);
        }
      }
    } catch (e) {
      console.error('OPENAI_FALLBACK_ERR', e);
    }

    if (!replyText) replyText = 'Thanks—message received.';

    const accountIdForInsert = accountId;
    const replyForInsert = replyText;

    (async () => {
      try {
        const sb = createClient(SB_URL, SB_KEY, {
          auth: { persistSession: false },
        });

        const { data: leadRow, error: leadErr } = await sb
          .from('leads')
          .upsert(
            { account_id: accountIdForInsert, phone: from, name: 'SMS Lead', status: 'active' },
            { onConflict: 'phone' },
          )
          .select('id')
          .single();

        if (leadErr) {
          console.error('LEAD_UPSERT_ERR', leadErr);
          return;
        }

        const { error: insErr } = await sb.from('messages_out').insert({
          account_id: accountIdForInsert,
          lead_id: leadRow?.id,
          to_phone: from,
          from_phone: to,
          body: replyForInsert,
          status: 'queued',
          provider: 'twilio',
          source: 'ai',
        });

        if (insErr) console.error('OUTBOUND_INSERT_ERR', insErr);
      } catch (err) {
        console.error('OUTBOUND_ASYNC_ERR', err);
      }
    })().catch((err) => console.error('OUTBOUND_ASYNC_ERR', err));

    // 4) Return TwiML with AI message
    res.setHeader('Content-Type', 'text/xml');
    res
      .status(200)
      .send(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${replyText
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
