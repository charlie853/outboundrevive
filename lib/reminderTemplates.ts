export function firstNameOf(name?: string | null) {
  if (!name) return undefined;
  const match = String(name).trim().match(/^[^\s-]+/);
  return match ? match[0] : undefined;
}

export function renderIntro(first?: string | null, brand = 'OutboundRevive') {
  const who = first ? `Hi ${first}—Charlie from ${brand}.` : `Hi—Charlie from ${brand}.`;
  return `${who} Wanted to reconnect and see if you still want help with the follow-up we discussed.`;
}

const gentle: Array<(f?: string | null) => string> = [
  (f?: string | null) =>
    f ? `Hi ${f} — just checking in. Happy to help whenever you’re ready.` : `Hi — just checking in. Happy to help whenever you’re ready.`,
  (f?: string | null) => (f ? `Hey ${f}, no rush — here if you have any questions.` : `Hey, no rush — here if you have any questions.`),
  (f?: string | null) => (f ? `${f}, quick nudge in case my last note got buried.` : `Quick nudge in case my last note got buried.`),
];

export function pickGentleReminder(first?: string | null) {
  const fn = gentle[Math.floor(Math.random() * gentle.length)];
  return fn(first);
}

// Legacy helpers kept for callers still using the old names
export function introCopy(first?: string | null, brand = 'OutboundRevive') {
  return renderIntro(first, brand);
}

export function gentleReminder(first?: string | null, attemptIndex = 0) {
  if (typeof attemptIndex === 'number' && attemptIndex > 0) {
    // bias toward later cadence phrasing when attempt index increases
    return gentle[2]?.(first) ?? pickGentleReminder(first);
  }
  return pickGentleReminder(first);
}
