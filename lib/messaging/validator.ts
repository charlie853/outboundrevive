// Central LLM output validator for all SMS routes

export type ValidationError = {
  field: string;
  message: string;
};

export type ValidationResult = {
  valid: boolean;
  errors: ValidationError[];
  sanitized?: string;
};

export function validateLLMOutput(
  message: string,
  options: {
    maxChars?: number;
    requireLinkLast?: boolean;
    disallowBullets?: boolean;
    confidence?: number;
  } = {}
): ValidationResult {
  const errors: ValidationError[] = [];
  let sanitized = message.trim();
  const maxChars = options.maxChars ?? 320;

  if (sanitized.length > maxChars) {
    errors.push({ field: 'length', message: `Exceeds ${maxChars} characters (got ${sanitized.length})` });
    // Truncate preserving link if present
    const linkMatch = sanitized.match(/(https?:\/\/[^\s]+)/);
    if (linkMatch && linkMatch[0]) {
      const beforeLink = sanitized.slice(0, sanitized.indexOf(linkMatch[0]) - 1);
      if (beforeLink.length + linkMatch[0].length <= maxChars) {
        sanitized = beforeLink + ' ' + linkMatch[0];
      } else {
        sanitized = sanitized.slice(0, maxChars - linkMatch[0].length - 1) + ' ' + linkMatch[0];
      }
    } else {
      sanitized = sanitized.slice(0, maxChars);
    }
  }

  // Check for bullet lists
  if (options.disallowBullets !== false) {
    if (/^[\s]*[-•*]\s+/m.test(sanitized) || /^[\s]*\d+[.)]\s+/m.test(sanitized)) {
      errors.push({ field: 'format', message: 'Bullet lists not allowed' });
      sanitized = sanitized.replace(/^[\s]*[-•*]\s+/gm, '').replace(/^[\s]*\d+[.)]\s+/gm, '').trim();
    }
  }

  // Check link position (should be last)
  if (options.requireLinkLast) {
    const linkMatch = sanitized.match(/(https?:\/\/[^\s]+)/g);
    if (linkMatch && linkMatch.length > 0) {
      const lastLink = linkMatch[linkMatch.length - 1];
      const afterLastLink = sanitized.slice(sanitized.lastIndexOf(lastLink) + lastLink.length).trim();
      if (afterLastLink) {
        errors.push({ field: 'link_position', message: 'Link must be last in message' });
        // Reorder: move link to end
        const beforeLinks = sanitized.replace(/https?:\/\/[^\s]+/g, '').trim();
        sanitized = (beforeLinks + ' ' + lastLink).trim();
      }
    }
  }

  // Low confidence warning (non-blocking, but log)
  if (typeof options.confidence === 'number' && options.confidence < 0.7) {
    errors.push({ field: 'confidence', message: `Low confidence (${(options.confidence * 100).toFixed(0)}%) — consider human review` });
  }

  return { valid: errors.filter(e => e.field !== 'confidence').length === 0, errors, sanitized };
}

