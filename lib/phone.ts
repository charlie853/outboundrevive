// Minimal E.164 (+1 US) normalization; returns null if invalid
export function toE164US(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = String(input).replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.startsWith('+' )) return `+${digits.replace(/^\+/, '')}`;
  return null;
}

import { parsePhoneNumberFromString } from 'libphonenumber-js/min';

export function toE164(raw: string, defaultCountry: 'US' | 'CA' = 'US') {
  try {
    const p = parsePhoneNumberFromString((raw || '').toString(), defaultCountry);
    if (p && p.isValid()) return p.number; // returns E.164, e.g. +15551234567
    return null;
  } catch {
    return null;
  }
}