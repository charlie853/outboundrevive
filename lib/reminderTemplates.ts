export function firstName(full?: string | null) {
  if (!full) return undefined;
  const f = full.trim().split(/\s+/)[0];
  return f && /^[A-Za-z'’-]+$/.test(f) ? f : undefined;
}

const REMINDER_VARIANTS: ((name?: string) => string)[] = [
  (n) => `Hi${n ? ` ${n}` : ""}, just checking in. Happy to share pricing or answer any quick questions whenever you’re ready.`,
  (n) => `Quick nudge${n ? `, ${n}` : ""} — would it help if I send a 2-min overview or a calendar link?`,
  (n) => `No rush${n ? `, ${n}` : ""}! If now’s not ideal, reply "pause" to snooze reminders. Otherwise I can send a couple time options.`,
];

export function nextReminderCopy(name?: string, attemptIndex = 0) {
  return REMINDER_VARIANTS[attemptIndex % REMINDER_VARIANTS.length](name);
}

export function introCopy(name?: string) {
  return `Hi${name ? ` ${name}` : ""} — it’s Charlie from OutboundRevive. I can send pricing, a 2-min overview, or a quick call link — what works best?`;
}
