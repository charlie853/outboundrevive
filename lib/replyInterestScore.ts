/**
 * Score reply text (email or SMS) for purchase intent. Used to rank "most likely to buy".
 * Returns score 0–1, window bucket, and a short summary for the watchlist.
 */

const INTERESTED_PHRASES = [
  /\b(yes|interested|sure|sounds good|let'?s do it|schedule|book|call me|reach out|tell me more|send (me )?info|demo|trial)\b/i,
  /\b(when can we|how do i|what'?s (the )?next|ready to|would like to)\b/i,
  /\b(call|meeting|zoom|calendly|availability|open (for|to))\b/i,
];

const NOT_INTERESTED_PHRASES = [
  /\b(no thank you|not interested|unsubscribe|stop|remove|opt[- ]?out|do not contact)\b/i,
  /\b(not (right now|at this time)|maybe later|pass)\b/i,
];

function determineWindow(score: number): '0-3m' | '3-6m' | '6-12m' {
  if (score >= 0.7) return '0-3m';
  if (score >= 0.45) return '3-6m';
  return '6-12m';
}

export type ReplyScoreResult = {
  score: number;
  window: '0-3m' | '3-6m' | '6-12m';
  summary: string;
  source: 'email_reply' | 'sms_reply';
};

/**
 * Score a single reply body (plain text) for purchase intent.
 * Uses keyword/heuristic scoring; can be extended with LLM later.
 */
export function scoreReplyText(
  text: string,
  source: 'email_reply' | 'sms_reply' = 'email_reply'
): ReplyScoreResult {
  const normalized = (text || '').trim().toLowerCase();
  if (normalized.length === 0) {
    return { score: 0.2, window: '6-12m', summary: 'No reply content', source };
  }

  let score = 0.25; // baseline for replying at all
  const signals: string[] = [];

  for (const re of NOT_INTERESTED_PHRASES) {
    if (re.test(normalized)) {
      return {
        score: 0.1,
        window: '6-12m',
        summary: 'Not interested or opt-out',
        source,
      };
    }
  }

  for (const re of INTERESTED_PHRASES) {
    if (re.test(normalized)) {
      score += 0.2;
      if (score >= 0.85) break;
    }
  }

  // Length as weak signal (thoughtful reply)
  if (normalized.length > 80) score += 0.05;
  if (normalized.length > 200) score += 0.05;

  score = Math.min(0.99, Math.round(score * 100) / 100);
  const window = determineWindow(score);

  if (score >= 0.7) {
    signals.push('High interest from reply');
  } else if (score >= 0.45) {
    signals.push('Moderate interest from reply');
  } else {
    signals.push('Reply received');
  }

  return {
    score,
    window,
    summary: signals.join('. ') || 'Reply scored',
    source,
  };
}
