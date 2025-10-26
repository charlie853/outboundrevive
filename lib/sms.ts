import { sendSms as sendViaTwilio } from "@/lib/twilio";

export async function sendSms({ to, from, body }: { to: string; from: string; body: string }) {
  // Current Twilio helper uses Messaging Service SID, so "from" is ignored but kept for API parity.
  return sendViaTwilio({ to, body });
}
