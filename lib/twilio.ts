import twilio from 'twilio';

const sid = process.env.TWILIO_ACCOUNT_SID!;
const token = process.env.TWILIO_AUTH_TOKEN!;
const messagingServiceSid = process.env.MESSAGING_SERVICE_SID!;

export const twilioClient = twilio(sid, token);

export function getMessagingServiceSid() {
  if (!messagingServiceSid) throw new Error('MESSAGING_SERVICE_SID is missing');
  return messagingServiceSid;
}