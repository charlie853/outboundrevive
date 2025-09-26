// lib/twilioVerify.ts
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Build the exact signature base that Twilio expects for x-www-form-urlencoded posts.
// https://www.twilio.com/docs/usage/security#validating-requests
export async function verifyTwilioRequest(req: NextRequest, fullUrl: string, authToken: string): Promise<boolean> {
  try {
    const header = req.headers.get('x-twilio-signature') || req.headers.get('X-Twilio-Signature') || '';
    if (!header) return false;

    // For application/x-www-form-urlencoded, Twilio signs URL + concatenated param key+value (keys sorted)
    const ct = req.headers.get('content-type') || '';
    if (!ct.includes('application/x-www-form-urlencoded')) return false;

    // Reconstruct the param string from formData in key-sorted order
    const form = await req.formData();
    const keys = Array.from(form.keys()).sort();
    let data = fullUrl;
    for (const k of keys) {
      const v = String(form.get(k) ?? '');
      data += k + v;
    }

    const expected = crypto
      .createHmac('sha1', authToken)
      .update(Buffer.from(data, 'utf-8'))
      .digest('base64');

    // Timing-safe compare
    const a = Buffer.from(header);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}