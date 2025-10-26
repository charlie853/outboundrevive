export const PAUSE_FOOTER = 'Reply PAUSE to pause reminders.';

export type FooterCtx = {
  requireFooter?: boolean;         // whether to add footer
  occasionalModulo?: number;       // add footer only every Nth send (default 3)
  sentCountHint?: number;          // optional counter you track per lead
};

/**
 * Add "PAUSE" footer only when required.
 * If occasionalModulo > 1, we only append on the Nth message.
 */
export function addFooter(body: string, ctx: FooterCtx = {}): string {
  const { requireFooter = false, occasionalModulo = 3, sentCountHint } = ctx;
  if (!requireFooter) return body;

  // Occasionally add (e.g., every 3rd reminder); time-based fallback if no counter
  let include = true;
  if (occasionalModulo > 1) {
    const bucket = sentCountHint ?? Math.floor(Date.now() / 60000); // minute bucket
    include = bucket % occasionalModulo === 0;
  }
  if (!include) return body;

  if (/pause reminders/i.test(body)) return body; // don't duplicate
  return body + (body.endsWith('.') ? ' ' : ' ') + PAUSE_FOOTER;
}
