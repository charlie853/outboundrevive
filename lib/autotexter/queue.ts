import { supabaseAdmin } from '@/lib/supabaseServer';
import { renderIntro, firstNameOf } from '@/lib/reminderTemplates';

type LeadForIntro = {
  id: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  crm_owner?: string | null;
  crm_status?: string | null;
  crm_stage?: string | null;
  crm_description?: string | null;
  crm_last_activity_at?: string | null;
  intro_sent_at?: string | null;
};

type AccountSettings = {
  brand?: string | null;
  booking_link?: string | null;
};

const settingsCache = new Map<string, AccountSettings | null>();

async function getAccountSettings(accountId: string): Promise<AccountSettings | null> {
  if (settingsCache.has(accountId)) {
    return settingsCache.get(accountId)!;
  }
  try {
    const { data } = await supabaseAdmin
      .from('account_settings')
      .select('brand, booking_link')
      .eq('account_id', accountId)
      .maybeSingle();
    settingsCache.set(accountId, data ?? null);
    return data ?? null;
  } catch (error) {
    console.warn('[autotexter] failed to load account_settings', error);
    settingsCache.set(accountId, null);
    return null;
  }
}

async function generateIntroMessage(accountId: string, lead: LeadForIntro): Promise<string> {
  const settings = await getAccountSettings(accountId);
  const brand = settings?.brand?.trim() || 'OutboundRevive';
  const booking = settings?.booking_link?.trim();

  const firstName = firstNameOf(lead.name ?? undefined);
  const lines: string[] = [];
  if (lead.company) lines.push(`Company: ${lead.company}`);
  if (lead.crm_status) lines.push(`Status: ${lead.crm_status}`);
  if (lead.crm_stage) lines.push(`Stage: ${lead.crm_stage}`);
  if (lead.crm_owner) lines.push(`Owner: ${lead.crm_owner}`);
  if (lead.crm_description) lines.push(`Notes: ${lead.crm_description}`);
  if (lead.crm_last_activity_at) {
    const formattedActivity = (() => {
      try {
        const d = new Date(lead.crm_last_activity_at);
        if (!Number.isNaN(d.getTime())) {
          return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        }
      } catch {}
      return lead.crm_last_activity_at;
    })();
    lines.push(`Last CRM activity: ${formattedActivity}`);
  }

  const contextBlock = lines.length ? lines.join('\n') : 'No additional CRM notes.';

  const prompt = [
    `You are the AI SMS assistant for ${brand}. Craft a first-touch SMS (max 280 characters) to re-engage a lead.`,
    `Use a warm, human tone. Reference useful CRM context if helpful.`,
    `Goal: spark a reply or invite them to continue the conversation.`,
    `Avoid emojis, ALL CAPS, long paragraphs, or compliance footers.`,
    booking
      ? `You may reference this scheduling link ONCE if it fits naturally: ${booking}`
      : `Do not include any links.`,
    '',
    `Lead name: ${lead.name || 'Unknown'}`,
    contextBlock,
  ].join('\n');

  const baseUrl =
    process.env.PUBLIC_BASE_URL ||
    process.env.PUBLIC_BASE ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    '';
  const secret = (process.env.INTERNAL_API_SECRET || '').trim();

  if (baseUrl && secret) {
    try {
      const resp = await fetch(`${baseUrl.replace(/\/$/, '')}/api/internal/knowledge/draft`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-secret': secret,
        },
        body: JSON.stringify({
          account_id: accountId,
          q: prompt,
          hints: {
            brand,
            style: 'initial_outreach',
            link_allowed: !!booking,
            booking_url: booking || undefined,
          },
        }),
      });

      if (resp.ok) {
        const data = await resp.json().catch(() => null);
        const reply =
          (typeof data?.reply === 'string' && data.reply.trim()) ||
          (typeof data?.text === 'string' && data.text.trim()) ||
          null;
        if (reply) {
          const trimmed = reply.length > 320 ? `${reply.slice(0, 317).trimEnd()}…` : reply;
          return trimmed;
        }
      } else {
        const detail = await resp.text().catch(() => '');
        console.warn('[autotexter] draft endpoint error', resp.status, detail);
      }
    } catch (error) {
      console.warn('[autotexter] draft request failed', error);
    }
  }

  const fallback = renderIntro(firstName, brand);
  return fallback.length > 320 ? `${fallback.slice(0, 317).trimEnd()}…` : fallback;
}

export async function queueIntroForLead(accountId: string, lead: LeadForIntro) {
  if (!lead?.id || !lead.phone) return;

  if (lead.intro_sent_at) {
    return;
  }

  const dedupKey = `intro:${lead.id}`;
  try {
    const { data: existing } = await supabaseAdmin
      .from('send_queue')
      .select('id, status')
      .eq('account_id', accountId)
      .eq('lead_id', lead.id)
      .eq('dedup_key', dedupKey)
      .in('status', ['queued', 'processing', 'sent'])
      .maybeSingle();

    if (existing) {
      return;
    }

    const { count: introCount, error: introError } = await supabaseAdmin
      .from('messages_out')
      .select('id', { head: true, count: 'exact' })
      .eq('lead_id', lead.id)
      .eq('intent', 'initial_outreach')
      .limit(1);

    if (introError) {
      console.warn('[autotexter] intro history check failed', introError.message);
    }

    if ((introCount ?? 0) > 0) {
      await supabaseAdmin
        .from('leads')
        .update({ intro_sent_at: new Date().toISOString() })
        .eq('id', lead.id)
        .eq('account_id', accountId);
      return;
    }

    const message = await generateIntroMessage(accountId, lead);
    if (!message) return;

    await supabaseAdmin.from('send_queue').insert({
      account_id: accountId,
      lead_id: lead.id,
      body: message,
      dedup_key: dedupKey,
      run_after: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[autotexter] failed to queue intro', { accountId, leadId: lead.id, error });
  }
}


