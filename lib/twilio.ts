import Twilio from 'twilio';

// New helpers (API key preferred, token fallback)
export function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID!;
  const keySid = process.env.TWILIO_API_KEY_SID;
  const keySecret = process.env.TWILIO_API_KEY_SECRET;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid) throw new Error('TWILIO_ACCOUNT_SID missing');

  if (keySid && keySecret) {
    return Twilio(keySid, keySecret, { accountSid });
  }
  if (authToken) {
    return Twilio(accountSid, authToken);
  }
  throw new Error('No Twilio credentials: set API key (SK…/secret) or TWILIO_AUTH_TOKEN');
}

export function getTwilioSender() {
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  // Support either TWILIO_FROM or TWILIO_FROM_NUMBER
  const from = process.env.TWILIO_FROM || process.env.TWILIO_FROM_NUMBER;
  if (messagingServiceSid) return { messagingServiceSid } as const;
  if (from) return { from } as const;
  throw new Error('Set TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM / TWILIO_FROM_NUMBER');
}

// Backwards-compatible exports used elsewhere in the app
export const twilioClient = (() => {
  try { return getTwilioClient(); } catch { return Twilio('AC', 'bad'); }
})();

export function getMessagingServiceSid() {
  const sid = process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.MESSAGING_SERVICE_SID;
  if (!sid) throw new Error('TWILIO_MESSAGING_SERVICE_SID missing');
  return sid;
}
