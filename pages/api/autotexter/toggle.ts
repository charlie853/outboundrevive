import type { NextApiRequest, NextApiResponse } from 'next';

export const config = { api: { bodyParser: true } };

const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111';
const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const TWILIO_FROM = process.env.TWILIO_FROM || '+18776575698';
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';

const baseHeaders = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
} satisfies Record<string, string>;

const writeHeaders = {
  ...baseHeaders,
  'Content-Type': 'application/json',
} satisfies Record<string, string>;

const upsertHeaders = {
  ...writeHeaders,
  Prefer: 'resolution=merge-duplicates',
} satisfies Record<string, string>;

const INITIAL_TEXT =
  "Hey it's OutboundRevive - quick follow-up from your inquiry. Want me to share pricing & next steps?";

type TwilioClient = {
  messages: {
    create: (payload: { from: string; to: string; body: string }) => Promise<unknown>;
  };
};

type TwilioFactory = (sid: string, token: string) => TwilioClient;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asTwilioClient(value: unknown): TwilioClient | null {
  if (!isRecord(value)) return null;
  const messages = value.messages;
  if (!isRecord(messages)) return null;
  const create = messages.create;
  if (typeof create !== 'function') return null;
  return value as TwilioClient;
}

async function ensureAccountSettings(enabled: boolean) {
  const payload = [{
    account_id: ACCOUNT_ID,
    brand: 'OutboundRevive',
    phone_from: TWILIO_FROM,
    tz: 'America/New_York',
    quiet_hours_start: '09:00',
    quiet_hours_end: '19:00',
    allow_weekends: true,
    daily_send_limit: 100,
    cooldown_minutes: 30,
    team_members: [],
    autotexter_enabled: enabled,
    updated_at: new Date().toISOString(),
  }];

  const upsert = await fetch(`${SUPABASE_URL}/rest/v1/account_settings?on_conflict=account_id`, {
    method: 'POST',
    headers: upsertHeaders,
    body: JSON.stringify(payload),
  });

  if (!upsert.ok) {
    await fetch(`${SUPABASE_URL}/rest/v1/account_settings?account_id=eq.${ACCOUNT_ID}`, {
      method: 'PATCH',
      headers: writeHeaders,
      body: JSON.stringify(payload[0]),
    });
  }
}

async function fetchEligibleLeads() {
  const url = new URL(`${SUPABASE_URL}/rest/v1/leads`);
  url.searchParams.set('account_id', `eq.${ACCOUNT_ID}`);
  url.searchParams.set('or', `(last_sent_at.is.null,delivery_status.eq.pending)`);
  url.searchParams.set('select', 'id,phone,name');
  url.searchParams.set('order', 'created_at.asc');
  url.searchParams.set('limit', '50');

  const response = await fetch(url.toString(), {
    headers: {
      ...baseHeaders,
      accept: 'application/json',
      Prefer: 'count=exact',
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`lead_query_failed: ${text.slice(0, 300)}`);
  }

  return (await response.json()) as Array<{ id: string; phone: string; name?: string }>; // Supabase schema
}

async function updateLeadStatus(leadId: string, status: 'delivered' | 'queued' | 'failed') {
  await fetch(`${SUPABASE_URL}/rest/v1/leads?id=eq.${leadId}`, {
    method: 'PATCH',
    headers: {
      ...writeHeaders,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      last_sent_at: new Date().toISOString(),
      delivery_status: status,
    }),
  })
    .then((r) => r.text())
    .catch(() => '');
}

async function insertMessageOut(
  leadId: string,
  toPhone: string,
  status: 'delivered' | 'queued' | 'failed'
) {
  await fetch(`${SUPABASE_URL}/rest/v1/messages_out`, {
    method: 'POST',
    headers: {
      ...writeHeaders,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify([
      {
        lead_id: leadId,
        from_phone: TWILIO_FROM,
        to_phone: toPhone,
        body: INITIAL_TEXT,
        status,
        provider: 'twilio',
        created_at: new Date().toISOString(),
      },
    ]),
  })
    .then((r) => r.text())
    .catch(() => '');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(200).json({ ok: false, error: 'Supabase env missing' });
    return;
  }

  try {
    const { enabled } = req.body || {};
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ ok: false, error: 'enabled:boolean required' });
      return;
    }

    await ensureAccountSettings(enabled);

    let attempted = 0;
    let sent = 0;
    let dryRun = false;

    if (enabled) {
      let leads: Array<{ id: string; phone: string }> = [];
      try {
        leads = await fetchEligibleLeads();
      } catch (leadError) {
        console.error('[AUTOTEXTER_LEADS]', leadError);
      }

      let twilioClient: TwilioClient | null = null;
      if (TWILIO_SID && TWILIO_TOKEN) {
        try {
          const imported = await import('twilio');
          const factoryCandidate = isRecord(imported) && 'default' in imported
            ? (imported.default as unknown)
            : (imported as unknown);

          if (typeof factoryCandidate === 'function') {
            const clientCandidate = (factoryCandidate as TwilioFactory)(TWILIO_SID, TWILIO_TOKEN);
            twilioClient = asTwilioClient(clientCandidate);
            if (!twilioClient) dryRun = true;
          } else {
            dryRun = true;
          }
        } catch {
          dryRun = true;
        }
      } else {
        dryRun = true;
      }

      for (const lead of leads) {
        attempted += 1;
        const to = lead.phone;
        if (!to) continue;

        let delivered = false;
        if (!dryRun && twilioClient) {
          try {
            await twilioClient.messages.create({ from: TWILIO_FROM, to, body: INITIAL_TEXT });
            delivered = true;
          } catch {
            delivered = false;
          }
        }

        const status: 'delivered' | 'queued' | 'failed' = delivered
          ? 'delivered'
          : dryRun
          ? 'queued'
          : 'failed';

        await updateLeadStatus(lead.id, status);
        await insertMessageOut(lead.id, to, status);

        if (delivered || dryRun) sent += 1;
      }
    }

    res.status(200).json({ ok: true, attempted, sent, dryRun });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    res.status(200).json({ ok: false, error: message });
  }
}
