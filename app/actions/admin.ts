'use server';

export async function adminSendSms(leadIds: string[], message: string, brand?: string) {
  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    throw new Error('No lead IDs provided');
  }
  const res = await fetch(`${process.env.PUBLIC_BASE_URL}/api/sms/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // IMPORTANT: this is read on the server; never exposed to the browser
      'x-admin-token': process.env.ADMIN_TOKEN || '',
    },
    body: JSON.stringify({ leadIds, message, brand }),
    // don’t cache admin calls
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Send failed (${res.status})`);
  }
  return res.json();
}