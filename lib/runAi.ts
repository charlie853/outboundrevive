import { DEFAULT_AI_FALLBACK_MESSAGE, generateSmsReply } from "@/lib/ai";

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
  try {
    const ctx = {
      brand,
      booking_link: bookingLink || null,
      lead_phone: fromPhone,
      twilio_number: _toPhone,
      first_name: leadName,
      inbound_text: userText,
      is_new_thread: true,
      last_contact_30d_ago: true,
      last_footer_within_30d: false,
      scheduling_intent: /(book|schedule|availability|call)/i.test(userText),
      asked_who_is_this: /who\s+is\s+this/i.test(userText),
      quiet_hours_block: false,
      state_cap_block: false,
      opt_out_phrase: null,
      help_requested: false,
    };
    const result = await generateSmsReply(ctx);
    const message = typeof result?.message === 'string' ? result.message.trim() : '';
    return message || DEFAULT_AI_FALLBACK_MESSAGE;
  } catch (err) {
    console.error('RUN_AI_GENERATE_ERR', err);
    return DEFAULT_AI_FALLBACK_MESSAGE;
  }
}
