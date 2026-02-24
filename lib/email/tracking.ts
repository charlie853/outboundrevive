/**
 * Build tracking URLs for open pixel and unsubscribe link.
 * baseUrl should be PUBLIC_BASE_URL or request origin (no trailing slash).
 */
export function openTrackingUrl(baseUrl: string, messageId: string): string {
  return `${baseUrl.replace(/\/$/, '')}/api/email/t/open/${messageId}`;
}

export function unsubTrackingUrl(baseUrl: string, messageId: string): string {
  return `${baseUrl.replace(/\/$/, '')}/api/email/t/unsub/${messageId}`;
}

/** 1x1 transparent GIF (base64) for open pixel */
export const TRACKING_PIXEL_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);
