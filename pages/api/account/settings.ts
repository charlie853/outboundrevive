import type { NextApiRequest, NextApiResponse } from 'next';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111';
const TABLE = 'account_settings';
const TIMEOUT_MS = 5000;

type SettingsRow = { autotexter_enabled?: boolean | null };

const baseHeaders = () => ({
  apikey: SERVICE_ROLE_KEY ?? '',
  Authorization: `Bearer ${SERVICE_ROLE_KEY ?? ''}`,
  accept: 'application/json',
});

async function supabaseFetch(path: string, init: RequestInit = {}) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error('Supabase env missing');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...init,
      headers: {
        ...baseHeaders(),
        ...(init.headers || {}),
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const message = await response.text().catch(() => '');
      throw new Error(message || `Supabase REST ${response.status}`);
    }

    return response;
  } finally {
    clearTimeout(timer);
  }
}

export async function getAutotexterEnabled(): Promise<boolean> {
  try {
    const response = await supabaseFetch(
      `${TABLE}?select=autotexter_enabled&account_id=eq.${ACCOUNT_ID}&limit=1`
    );
    const rows = (await response.json()) as SettingsRow[];
    return Boolean(rows?.[0]?.autotexter_enabled);
  } catch (error) {
    console.warn('[AUTOTEXTER_SETTINGS] read failed', error);
    throw error;
  }
}

export async function setAutotexterEnabled(enabled: boolean) {
  await supabaseFetch(TABLE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      account_id: ACCOUNT_ID,
      autotexter_enabled: enabled,
    }),
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    res.status(200).json({ ok: false, error: 'Supabase env missing' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const enabled = await getAutotexterEnabled().catch(() => false);
      res.status(200).json({ ok: true, autotexter_enabled: enabled });
      return;
    }

    if (req.method === 'PUT') {
      const { enabled } = req.body ?? {};
      if (typeof enabled !== 'boolean') {
        res.status(400).json({ ok: false, error: 'enabled must be boolean' });
        return;
      }

      await setAutotexterEnabled(enabled);
      res.status(200).json({ ok: true, autotexter_enabled: enabled });
      return;
    }

    res.setHeader('Allow', 'GET, PUT');
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    res.status(200).json({ ok: false, error: message });
  }
}
