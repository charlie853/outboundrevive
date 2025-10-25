export function nextReminderVariant(n: number) {
  const templates = [
    "Quick nudge — still happy to help. Reply PAUSE to stop reminders.",
    "Just checking in — want me to send pricing or a quick link to book? Reply PAUSE to pause reminders.",
    "Friendly reminder — I’m here if you need anything. Reply PAUSE to pause reminders.",
  ];
  if (!Number.isFinite(n)) return templates[0];
  const idx = Math.abs(Math.floor(n)) % templates.length;
  return templates[idx];
}
