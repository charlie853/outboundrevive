import OpenAI from 'openai';

export type SmsReplyContract = {
  intent: string;
  confidence: number;
  message: string;
  needs_footer: boolean;
  actions: Array<Record<string, unknown>>;
  hold_until: string | null;
  policy_flags: {
    quiet_hours_block: boolean;
    state_cap_block: boolean;
    footer_appended: boolean;
    opt_out_processed: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const SAFE_FALLBACK: SmsReplyContract = {
  intent: 'other',
  confidence: 0.3,
  message: "Happy to help and share details. Would you like a quick 10-min call, or should I text a brief summary?",
  needs_footer: false,
  actions: [] as Array<Record<string, unknown>>,
  hold_until: null as string | null,
  policy_flags: {
    quiet_hours_block: false,
    state_cap_block: false,
    footer_appended: false,
    opt_out_processed: false,
  },
};

export const DEFAULT_AI_FALLBACK_MESSAGE = SAFE_FALLBACK.message;

export async function generateSmsReply(ctx: Record<string, unknown>): Promise<SmsReplyContract> {
  const system = process.env.SMS_SYSTEM_PROMPT;
  if (!system) throw new Error('Missing SMS_SYSTEM_PROMPT');

  try {
    const user = JSON.stringify(ctx);

    const r = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.3,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
    });

    const raw = r.choices?.[0]?.message?.content?.trim() || '{}';
    try {
      const parsed = JSON.parse(raw) as SmsReplyContract;
      return parsed ?? { ...SAFE_FALLBACK };
    } catch (e) {
      console.error('GENERATE_SMS_REPLY_PARSE_ERR', e, raw);
      return { ...SAFE_FALLBACK };
    }
  } catch (err) {
    console.error('GENERATE_SMS_REPLY_ERR', err);
    return { ...SAFE_FALLBACK };
  }
}

type DraftParams = {
  brand: string;
  booking?: string;
  lead: { name?: string | null; phone: string };
  lastInbound: string;
  managedMode?: boolean;
};

export async function draftSmsReply({
  brand,
  booking,
  lead,
  lastInbound,
  managedMode = true,
}: DraftParams): Promise<string> {
  const ctx = {
    brand,
    booking_link: booking || null,
    first_name: lead.name || null,
    inbound_text: lastInbound,
    is_new_thread: managedMode,
    last_contact_30d_ago: true,
    last_footer_within_30d: false,
    scheduling_intent: false,
    asked_who_is_this: false,
    quiet_hours_block: false,
    state_cap_block: false,
    opt_out_phrase: null,
    help_requested: false,
  };

  const result = await generateSmsReply(ctx).catch(() => ({ ...SAFE_FALLBACK }));
  const message = typeof result?.message === 'string' ? result.message.trim() : '';
  return message || SAFE_FALLBACK.message;
}
