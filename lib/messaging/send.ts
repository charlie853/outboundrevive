import { minutesNowInTZ, parseHHMM, withinWindow } from './utils/time';

export async function sendSms({ account_id, lead, body }:{ account_id: string; lead: any; body: string }) {
  const base = (process.env.PUBLIC_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
  const admin = (process.env.ADMIN_API_KEY || process.env.ADMIN_TOKEN || '').trim();
  const res = await fetch(`${base}/api/sms/send`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(admin ? { 'x-admin-token': admin } : {})
    },
    body: JSON.stringify({ account_id, lead_id: lead.id, leadIds: [lead.id], message: body })
  });
  const j = await res.json().catch(() => ({}));
  const sid = j?.results?.[0]?.sid || null;
  return { sid, status: sid ? 'queued' : 'failed' };
}

