export type SendSmsParams = {
  to: string;
  body: string;
  from?: string;                 // optional if using Messaging Service
  messagingServiceSid?: string;  // preferred
  statusCallback?: string;
};

export async function sendSms(params: SendSmsParams) {
  const { to, body, from, messagingServiceSid, statusCallback } = params;

  const accountSid = process.env.TWILIO_ACCOUNT_SID!;
  const basic = (process.env.TWILIO_API_KEY_SID && process.env.TWILIO_API_KEY_SECRET)
    ? `${process.env.TWILIO_API_KEY_SID}:${process.env.TWILIO_API_KEY_SECRET}`
    : `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN!}`;

  const form = new URLSearchParams();
  form.set('To', to.trim());
  if (messagingServiceSid) form.set('MessagingServiceSid', messagingServiceSid);
  if (from) form.set('From', from);
  form.set('Body', body);
  if (statusCallback) form.set('StatusCallback', statusCallback);

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(basic).toString('base64'),
    },
    body: form,
    cache: 'no-store',
  });

  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Twilio send failed: ${res.status} ${res.statusText} ${JSON.stringify(json)}`);
  }
  return { sid: String(json.sid || ''), status: String(json.status || 'queued') };
}
