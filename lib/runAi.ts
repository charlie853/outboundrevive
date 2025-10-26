import { draftSmsReply } from "@/lib/ai";

type RunAiArgs = {
  fromPhone: string;
  toPhone: string;
  userText: string;
  firstName?: string | null;
  fullName?: string | null;
  brand?: string;
  bookingLink?: string;
};

export async function runAi({
  fromPhone,
  toPhone: _toPhone,
  userText,
  firstName,
  fullName,
  brand = "OutboundRevive",
  bookingLink,
}: RunAiArgs): Promise<string> {
  const leadName = fullName ?? firstName ?? null;
  const text = await draftSmsReply({
    brand,
    booking: bookingLink,
    lead: { name: leadName, phone: fromPhone },
    lastInbound: userText,
  });
  return text;
}
