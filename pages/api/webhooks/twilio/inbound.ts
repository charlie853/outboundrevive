import type { NextApiRequest, NextApiResponse } from 'next';

function xmlEscape(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function askDraft(q: string, account_id: string, from: string, to: string) {
  const base = (process.env.PUBLIC_BASE_URL || '').trim();
  const secret = (process.env.INTERNAL_API_SECRET || '').trim();
  if (!base || !secret) return null;

  const r = await fetch(`${base}/api/internal/knowledge/draft`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-internal-secret': secret,
    },
    body: JSON.stringify({ account_id, q, channel: 'sms', from, to }),
  });

  if (!r.ok) return null;
  const j = await r.json().catch(() => ({}));
  return (j?.reply || j?.text || '').toString().trim() || null;
}

async function askOpenAI(q: string) {
  const apiKey = (process.env.OPENAI_API_KEY || '').trim();
  const model = (process.env.OPENAI_MODEL || process.env.AI_MODEL || 'gpt-4o-mini').trim();
  if (!apiKey) return null;

  const sys =
    "You are the SMS assistant for OutboundRevive. Reply in ≤2 SMS-length messages, friendly and helpful. If asked about pricing, give a clear short summary and offer to book a quick call.";

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: q },
      ],
      temperature: 0.4,
    }),
  });
  if (!resp.ok) return null;

  const data = await resp.json().catch(() => ({}));
  return data?.choices?.[0]?.message?.content?.trim() || null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Twilio sends x-www-form-urlencoded by default
    const From = String(req.body?.From ?? req.query?.From ?? '').trim();
    const To   = String(req.body?.To   ?? req.query?.To   ?? '').trim();
    const Body = String(req.body?.Body ?? req.query?.Body ?? '').trim();

    // Resolve account by phone_from == To (fallback to DEFAULT_ACCOUNT_ID)
    const sbUrl = (process.env.SUPABASE_URL || '').trim();
    const sbKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

    let account_id = (process.env.DEFAULT_ACCOUNT_ID || '').trim();
    try {
      const r = await fetch(
        `${sbUrl}/rest/v1/account_settings?select=account_id,autotexter_enabled,phone_from&phone_from=eq.${encodeURIComponent(To)}`,
        { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } }
      );
      if (r.ok) {
        const arr = await r.json();
        if (Array.isArray(arr) && arr[0]?.account_id) account_id = arr[0].account_id;
        // Optional gate
        if (Array.isArray(arr) && arr[0] && arr[0].autotexter_enabled === false) {
          res.setHeader('Content-Type', 'text/xml; charset=utf-8');
          res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${xmlEscape('Thanks—message received.')}</Message></Response>`);
          return;
        }
      }
    } catch {}

    let replyText = 'Thanks—message received.';
    if (Body) {
      // Try internal draft route first
      replyText = (await askDraft(Body, account_id, From, To)) || replyText;
      // Fallback to direct LLM if draft fails
      if (replyText === 'Thanks—message received.') {
        replyText = (await askOpenAI(Body)) || replyText;
      }
      // Trim to safe SMS length
      replyText = replyText.slice(0, 480);
    }

    // --- persist outbound AI reply so dashboards see it ---
    try {
      const sbUrl = process.env.SUPABASE_URL!;
      const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
      const defaultAccount = process.env.DEFAULT_ACCOUNT_ID;

      // Normalize – remove whitespace/newlines
      const leadPhone = (From || '').replace(/\s+/g, '');
      const twilioFrom = (To || '').replace(/\s+/g, '');

      // Resolve account by Twilio number, else fallback
      let account_id = defaultAccount;
      try {
        const s = await fetch(
          `${sbUrl}/rest/v1/account_settings?select=account_id&phone_from=eq.${encodeURIComponent(twilioFrom)}&limit=1`,
          { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } }
        );
        if (s.ok) {
          const j = await s.json();
          if (Array.isArray(j) && j[0]?.account_id) account_id = j[0].account_id;
        }
      } catch {}

      // Insert outbound AI reply
      const ins = await fetch(`${sbUrl}/rest/v1/messages_out`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: sbKey,
          Authorization: `Bearer ${sbKey}`,
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          account_id,
          to_phone: leadPhone,
          from_phone: twilioFrom,
          body: replyText,
          status: 'queued',
        }),
      });

      if (!ins.ok) {
        const errTxt = await ins.text().catch(() => '');
        console.error('OUTBOUND_INSERT_FAILED', ins.status, errTxt);
      } else {
        const row = await ins.json().catch(() => null);
        console.log('OUTBOUND_INSERT_OK', row?.[0]?.id || null, { account_id, leadPhone, twilioFrom });
      }
    } catch (e) {
      console.error('OUTBOUND_INSERT_THROW', e);
    }

    res.setHeader('Content-Type', 'text/xml; charset=utf-8');
    res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${xmlEscape(replyText)}</Message></Response>`);
  } catch {
    res.setHeader('Content-Type', 'text/xml; charset=utf-8');
    res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>Thanks—message received.</Message></Response>`);
  }
}
