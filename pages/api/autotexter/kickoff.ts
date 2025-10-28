import type { NextApiRequest, NextApiResponse } from 'next';

const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111';
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_FROM = process.env.TWILIO_FROM || '';

const headers = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates',
};

const INITIAL_TEXT =
  "Hey, it’s OutboundRevive — quick follow-up from your inquiry. Want me to share pricing & next steps?";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const setResp = await fetch(
      `${SUPABASE_URL}/rest/v1/account_settings?account_id=eq.${ACCOUNT_ID}&select=autotexter_enabled,brand,phone_from`,
      { headers }
    );
    const setJson = (await setResp.json())[0] || {};
    if (!setJson?.autotexter_enabled) {
      return res.status(200).json({ ok: false, error: 'autotexter_disabled' });
    }
    const brand = setJson.brand || 'OutboundRevive';
    const phone_from = setJson.phone_from || TWILIO_FROM;

    const q = new URL(`${SUPABASE_URL}/rest/v1/leads`);
    q.searchParams.set('account_id', `eq.${ACCOUNT_ID}`);
    q.searchParams.set('or', '(last_sent_at.is.null,delivery_status.eq.pending)');
    q.searchParams.set('select', 'id,phone,name');
    q.searchParams.set('order', 'created_at.asc');
    q.searchParams.set('limit', '50');
    const leadsResp = await fetch(q.toString(), { headers });
    const leads: { id: string; phone: string; name?: string }[] = leadsResp.ok ? await leadsResp.json() : [];

    let attempted = 0, sent = 0, dryRun = false;
    let twilioClient: any = null;
    if (TWILIO_SID && TWILIO_TOKEN && phone_from) {
      try {
        const twilio = (await import('twilio')).default;
        twilioClient = twilio(TWILIO_SID, TWILIO_TOKEN);
      } catch { dryRun = true; }
    } else {
      dryRun = true;
    }

    for (const lead of leads) {
      attempted++;
      const to = lead.phone;
      let delivered = false;

      try {
        if (!dryRun && twilioClient) {
          await twilioClient.messages.create({ from: phone_from, to, body: INITIAL_TEXT });
          delivered = true;
        }
      } catch { delivered = false; }

      const now = new Date().toISOString();

      await fetch(`${SUPABASE_URL}/rest/v1/leads?id=eq.${lead.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          last_sent_at: now,
          delivery_status: delivered ? 'delivered' : (dryRun ? 'queued' : 'failed'),
        }),
      }).catch(() => {});

      await fetch(`${SUPABASE_URL}/rest/v1/messages_out`, {
        method: 'POST',
        headers,
        body: JSON.stringify([{
          account_id: ACCOUNT_ID,    // <-- important
          lead_id: lead.id,
          from_phone: phone_from,
          to_phone: to,
          body: INITIAL_TEXT,
          status: delivered ? 'delivered' : (dryRun ? 'queued' : 'failed'),
          provider: 'twilio',
          created_at: now,
        }]),
      }).catch(() => {});

      if (delivered || dryRun) sent++;
    }

    res.status(200).json({ ok: true, attempted, sent, dryRun, brand, from: phone_from });
  } catch (e: any) {
    res.status(200).json({ ok: false, error: String(e?.message || e) });
  }
}
