// Compute SMS segment counts (GSM-7 vs UCS-2)

const GSM7_REGEX = /^[\n\r\t\x20-\x7E€£¥èéùìòÇØøÅåÄäÖöÑñÆæßÉ§¿¡^{}\\\[~\]|]*$/; // includes basic GSM + escape-set

export function isGsm7(text: string): boolean {
  return GSM7_REGEX.test(text || '');
}

export function countSegments(text: string): number {
  const s = String(text || '');
  if (s.length === 0) return 1;
  if (isGsm7(s)) {
    // GSM-7: 160 chars per single segment; 153 chars per segment in concatenated messages
    // Once you exceed 160, you must use concatenated format (153 per segment)
    const single = 160;
    const concat = 153;
    if (s.length <= single) return 1;
    return Math.ceil(s.length / concat);
  }
  // UCS-2: 70 chars per single segment; 67 chars per segment in concatenated messages
  const singleU = 70;
  const concatU = 67;
  if (s.length <= singleU) return 1;
  return Math.ceil(s.length / concatU);
}


