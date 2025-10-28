import type { NextApiRequest, NextApiResponse } from 'next';
import {
  ACCOUNT_ID,
  setAutotexterEnabled,
} from '../account/settings';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TIMEOUT_MS = 5000;

const LEAD_PHONE = '+18183709444';
const LEAD_NAME = 'Charlie Fregozo';

const twilioFrom = (() => {
  const explicit = (process.env.TWILIO_FROM_NUMBER || '').trim();
  if (explicit) return explicit;
  const legacy = (process.env.TWILIO_FROM || '').trim();
  return legacy || null;
})();

type SupabaseRequestInit = RequestInit & { timeoutMs?: number };

function supabaseHeaders(extra?: Record<string, string>) {
  return {
    apikey: SERVICE_ROLE_KEY ?? '',
    Authorization: `Bearer ${SERVICE_ROLE_KEY ?? ''}`,
    accept: 'application/json',
    ...(extra || {}),
  };
}

async function supabaseFetch(path: string, init: SupabaseRequestInit = {}) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error('Supabase env missing');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? TIMEOUT_MS);

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...init,
      headers: {
        ...supabaseHeaders(init.headers as Record<string, string> | undefined),
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(text || `Supabase REST ${response.status}`);
    }

    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function seedLead() {
  const nowISO = new Date().toISOString();

  await supabaseFetch('leads', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      account_id: ACCOUNT_ID,
      name: LEAD_NAME,
      phone: LEAD_PHONE,
      created_at: nowISO,
      last_sent_at: nowISO,
      delivery_status: 'delivered',
      replied: true,
      last_reply_at: nowISO,
    }),
  });

  await supabaseFetch('messages_out', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      account_id: ACCOUNT_ID,
      from_phone: twilioFrom,
      to_phone: LEAD_PHONE,
      body: 'Hey Charlie — this is the auto-texter smoke test. Reply to trigger the AI response.',
      status: 'delivered',
      created_at: nowISO,
      channel: 'sms',
      provider: 'twilio',
    }),
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    res.status(200).json({ ok: false, error: 'Supabase env missing' });
    return;
  }

  try {
    const { enabled } = req.body ?? {};
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ ok: false, error: 'enabled must be boolean' });
      return;
    }

    await setAutotexterEnabled(enabled);

    if (enabled) {
      try {
        await seedLead();
      } catch (seedError) {
        // try to roll back the flag so UI stays consistent
        try {
          await setAutotexterEnabled(false);
        } catch (rollbackError) {
          console.error('[AUTOTEXTER_TOGGLE] rollback failed', rollbackError);
        }
        throw seedError instanceof Error
          ? seedError
          : new Error('Failed to seed initial data');
      }
    }

    res.status(200).json({ ok: true, enabled });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'toggle_failed';
    res.status(200).json({ ok: false, error: message });
  }
}
