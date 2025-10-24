export async function sendSms(opts: { to: string; body: string }) {
  const acc = process.env.TWILIO_ACCOUNT_SID!;
  const key = process.env.TWILIO_API_KEY_SID!;
  const secret = process.env.TWILIO_API_KEY_SECRET!;
  const msid = process.env.TWILIO_MESSAGING_SERVICE_SID!; // REQUIRED
  const base = (process.env.PUBLIC_BASE || process.env.PUBLIC_BASE_URL || '').trim();

  if (!msid) throw new Error('Missing TWILIO_MESSAGING_SERVICE_SID');
  const params = new URLSearchParams();
  params.append('To', opts.to);
  params.append('MessagingServiceSid', msid);
  params.append('Body', opts.body);
  if (base) params.append('StatusCallback', `${base}/api/webhooks/twilio/status`);

  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${acc}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  const json = await resp.json().catch(() => ({} as any));
  if (!resp.ok) {
    console.error('[twilio.sendSms] error', resp.status, json);
    throw new Error((json as any)?.message || `Twilio ${resp.status}`);
  }
  return { sid: (json as any).sid as string, status: (json as any).status as string };
}
