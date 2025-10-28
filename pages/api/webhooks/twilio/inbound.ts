import type { NextApiRequest, NextApiResponse } from 'next';

export const config = { api: { bodyParser: true } };

type UpsertOpts = { apikey: string; auth: string; url: string };
function sbHeaders(o: UpsertOpts) {
  return { apikey: o.apikey, Authorization: `Bearer ${o.auth}`, 'content-type': 'application/json' };
}
function normPhone(s?: string) {
  if (!s) return '';
  const t = s.trim().replace(/\s+/g, '');
  return t.startsWith('+') ? t : '+' + t.replace(/^\+?/, '');
}
function publicBase(req: NextApiRequest) {
  const host = process.env.PUBLIC_BASE_URL || `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  return host.replace(/\/+$/, '');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Twilio posts application/x-www-form-urlencoded
  try {
    const body = (req.body as Record<string, unknown>) || {};
    const From = normPhone(body.From as string);
    const To = normPhone(body.To as string);
    const Text = String(body.Body ?? '').trim();

    // Safety: missing params -> no-op TwiML
    if (!From || !To || !Text) {
      res
        .status(200)
        .setHeader('content-type', 'text/xml')
        .send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>Thanks—message received.</Message></Response>`);
      return;
    }

    // Load account settings by to-phone (fallback to DEFAULT_ACCOUNT_ID)
    const SB_URL = process.env.SUPABASE_URL!;
    const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const headers = sbHeaders({ apikey: SB_KEY, auth: SB_KEY, url: SB_URL });

    let acct: any = null;
    {
      const q = new URL(`${SB_URL}/rest/v1/account_settings`);
      q.searchParams.set('select', 'account_id,brand,autotexter_enabled,phone_from');
      q.searchParams.set('phone_from', `eq.${encodeURIComponent(To)}`);
      const r = await fetch(q.toString(), { headers });
      const rows = r.ok ? await r.json() : [];
      acct = rows?.[0] || null;
    }
    const account_id = acct?.account_id || process.env.DEFAULT_ACCOUNT_ID;
    const brand = acct?.brand || 'Your Team';
    const enabled = !!acct?.autotexter_enabled;

    // Log inbound (messages_in)
    let inId: string | null = null;
    try {
      const ins = await fetch(`${SB_URL}/rest/v1/messages_in`, {
        method: 'POST',
        headers,
        body: JSON.stringify([
          {
            account_id,
            from_phone: From,
            to_phone: To,
            body: Text,
            processed: false,
          },
        ]),
      });
      if (ins.ok) {
        const j = await ins.json();
        inId = j?.[0]?.id || null;
      }
    } catch {}

    let replyText = '';

    // (1) Call your existing internal draft route (App Router) with secret
    try {
      const draftUrl = `${publicBase(req)}/api/internal/knowledge/draft`;
      const r = await fetch(draftUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-secret': process.env.INTERNAL_API_SECRET || '',
        },
        body: JSON.stringify({
          account_id,
          channel: 'sms',
          from: From,
          to: To,
          text: Text,
        }),
      });
      if (r.ok) {
        const dj = await r.json().catch(() => ({} as any));
        const drafted = (dj?.text || dj?.draft || dj?.message || '').trim();
        if (drafted) replyText = drafted;
      }
    } catch {}

    // (2) Optional inline OpenAI fallback if internal route gave nothing
    if (!replyText && process.env.OPENAI_API_KEY) {
      try {
        const model = process.env.AI_MODEL || 'gpt-4o-mini';
        const sys = `You are the SMS assistant for ${brand}. Be concise, friendly, and helpful. Keep messages under 480 characters.`;
        const payload = {
          model,
          messages: [
            { role: 'system', content: sys },
            { role: 'user', content: Text },
          ],
          temperature: 0.5,
        };
        const rr = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'content-type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
          body: JSON.stringify(payload),
        });
        const jj = rr.ok ? await rr.json() : null;
        const ai = jj?.choices?.[0]?.message?.content?.trim();
        if (ai) replyText = ai;
      } catch {}
    }

    // If autotexter disabled or AI failed, graceful fallback
    if (!enabled || !replyText) replyText = 'Thanks—message received.';

    // (3) Insert messages_out for tracking (even though Twilio sends from TwiML)
    try {
      await fetch(`${SB_URL}/rest/v1/messages_out`, {
        method: 'POST',
        headers,
        body: JSON.stringify([
          {
            account_id,
            to_phone: From,
            from_phone: To,
            body: replyText,
            status: 'queued',
          },
        ]),
      });
    } catch {}

    // (4) Mark inbound processed=true now that we have a reply path
    if (inId) {
      try {
        await fetch(`${SB_URL}/rest/v1/messages_in?id=eq.${inId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ processed: true }),
        });
      } catch {}
    }

    // (5) Reply TwiML
    res
      .status(200)
      .setHeader('content-type', 'text/xml')
      .send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(replyText)}</Message></Response>`);
  } catch (e) {
    // Final safety: never 500 to Twilio; return a benign message
    res
      .status(200)
      .setHeader('content-type', 'text/xml')
      .send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>Thanks—message received.</Message></Response>`);
  }
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
