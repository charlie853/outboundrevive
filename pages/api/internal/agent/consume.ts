import type { NextApiRequest, NextApiResponse } from 'next';

const SB_URL = process.env.SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID!;
const TWILIO_AUTH = process.env.TWILIO_AUTH_TOKEN!;
const FROM = (process.env.TWILIO_FROM || '').trim();
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || '';

type InboundRow = {
  id: string;
  account_id: string;
  from_phone: string;
  to_phone: string;
  body: string;
  created_at: string;
  processed: boolean | null;
};

type AccountSettings = {
  account_id: string;
  autotexter_enabled: boolean;
  phone_from: string | null;
  daily_send_limit: number | null;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  allow_weekends: boolean | null;
  brand: string | null;
  tz: string | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    const settingsResp = await fetch(
      `${SB_URL}/rest/v1/account_settings?select=*&phone_from=eq.${encodeURIComponent(FROM)}&limit=1`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    if (!settingsResp.ok) {
      const t = await settingsResp.text().catch(() => '');
      return res.status(200).json({ ok: false, error: `settings_fetch_failed: ${t}` });
    }
    const [settings]: AccountSettings[] = await settingsResp.json();
    if (!settings) return res.status(200).json({ ok: false, error: 'no_account_for_phone_from' });
    if (!settings.autotexter_enabled) return res.status(200).json({ ok: true, attempted: 0, sent: 0, note: 'autotexter_disabled' });

    const accountId = settings.account_id;

    const inboundResp = await fetch(
      `${SB_URL}/rest/v1/messages_in?account_id=eq.${accountId}&processed=is.false&order=created_at.asc&limit=10`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    if (!inboundResp.ok) {
      const t = await inboundResp.text().catch(() => '');
      return res.status(200).json({ ok: false, error: `inbound_fetch_failed: ${t}` });
    }
    const inbound: InboundRow[] = await inboundResp.json();

    let attempted = 0;
    let sent = 0;

    for (const msg of inbound) {
      attempted++;

      let replyText = '';
      try {
        const draftResp = await fetch(`${PUBLIC_BASE_URL}/api/internal/knowledge/draft`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            account_id: accountId,
            channel: 'sms',
            input: {
              from: msg.from_phone,
              to: msg.to_phone,
              question: msg.body,
              context: {
                brand: settings.brand || 'OutboundRevive',
                offering: 'Lead revival & appointment setting via compliant SMS',
                tone: 'concise, helpful, sales-aware, not pushy',
              },
            },
          }),
        });

        if (draftResp.ok) {
          const dj = await draftResp.json();
          replyText = (dj?.text || dj?.answer || '').toString().trim();
        }
      } catch {}

      if (!replyText) {
        replyText = 'Totally—pricing depends on volume and use-case. Most clients start with a pilot this week so you can see ROI fast. Want me to text options or send a quick one-pager?';
      }

      const twilioForm = new URLSearchParams({ From: FROM, To: msg.from_phone, Body: replyText });
      const twilioResp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_AUTH}`).toString('base64'),
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: twilioForm,
      });

      const okTwilio = twilioResp.ok;

      await Promise.allSettled([
        fetch(`${SB_URL}/rest/v1/messages_out`, {
          method: 'POST',
          headers: {
            apikey: SB_KEY,
            Authorization: `Bearer ${SB_KEY}`,
            'content-type': 'application/json',
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify([{
            account_id: accountId,
            from_phone: FROM,
            to_phone: msg.from_phone,
            body: replyText,
            status: okTwilio ? 'queued' : 'failed',
          }]),
        }),
        fetch(`${SB_URL}/rest/v1/messages_in?id=eq.${msg.id}`, {
          method: 'PATCH',
          headers: {
            apikey: SB_KEY,
            Authorization: `Bearer ${SB_KEY}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ processed: true }),
        }),
      ]);

      if (okTwilio) sent++;
    }

    return res.status(200).json({ ok: true, attempted, sent });
  } catch (e: any) {
    return res.status(200).json({ ok: false, error: String(e?.message || e) });
  }
}
