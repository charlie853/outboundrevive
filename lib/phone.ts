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