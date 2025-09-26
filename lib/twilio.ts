import twilio from 'twilio';

export const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

export function getMessagingServiceSid() {
  const sid = process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.MESSAGING_SERVICE_SID;
  if (!sid) throw new Error('TWILIO_MESSAGING_SERVICE_SID missing');
  return sid;
}