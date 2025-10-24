export type SendSmsArgs = {
  to: string;
  body: string;
  messagingServiceSid: string;
  statusCallback?: string;
};

export async function sendSms({
  to,
  body,
  messagingServiceSid,
  statusCallback,
}: SendSmsArgs): Promise<{ sid: string; status: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID!;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid) throw new Error('TWILIO_ACCOUNT_SID missing');
  if (!((apiKeySid && apiKeySecret) || authToken)) {
    throw new Error('Twilio credentials missing (API key pair or AUTH token)');
  }

  const basic = apiKeySid && apiKeySecret
    ? `${apiKeySid}:${apiKeySecret}`
    : `${accountSid}:${authToken!}`;

  const form = new URLSearchParams({
    To: to,
    MessagingServiceSid: messagingServiceSid,
    Body: body,
  });
  if (statusCallback) form.set('StatusCallback', statusCallback);

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(basic).toString('base64'),
      },
      body: form,
      cache: 'no-store',
    }
  );

  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Twilio send failed: ${res.status} ${res.statusText} ${JSON.stringify(json)}`);
  }
  return { sid: String(json.sid || ''), status: String(json.status || 'queued') };
}
