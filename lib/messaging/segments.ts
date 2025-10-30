// Compute SMS segment counts (GSM-7 vs UCS-2)

const GSM7_REGEX = /^[\n\r\t\x20-\x7E€£¥èéùìòÇØøÅåÄäÖöÑñÆæßÉ§¿¡^{}\\\[~\]|]*$/; // includes basic GSM + escape-set

export function isGsm7(text: string): boolean {
  return GSM7_REGEX.test(text || '');
}

export function countSegments(text: string): number {
  const s = String(text || '');
  if (s.length === 0) return 1;
  if (isGsm7(s)) {
    // GSM-7: 160 per segment; concatenated = 153
    const single = 160;
    const concat = 153;
    return s.length <= single ? 1 : Math.ceil(s.length / concat);
  }
  // UCS-2: 70 per segment; concatenated = 67
  const singleU = 70;
  const concatU = 67;
  return s.length <= singleU ? 1 : Math.ceil(s.length / concatU);
}


