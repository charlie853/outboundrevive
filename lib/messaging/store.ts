import { supabaseAdmin } from '@/lib/supabaseServer';

export async function getSettings(account_id: string) {
  const { data } = await supabaseAdmin
    .from('app_settings')
    .select('brand, booking_link, timezone, quiet_start, quiet_end, templates')
    .eq('account_id', account_id)
    .maybeSingle();
  return {
    brand: data?.brand || 'OutboundRevive',
    booking_link: data?.booking_link || '',
    timezone: data?.timezone || 'America/New_York',
    quiet_start: data?.quiet_start || '09:00',
    quiet_end: data?.quiet_end || '19:00',
    revive_days_threshold: 30,
    new_lead_grace_minutes: 10,
  } as any;
}

export async function getLeadAgeDays(lead_id: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from('leads')
    .select('created_at')
    .eq('id', lead_id)
    .maybeSingle();
  if (!data?.created_at) return 9999;
  const ms = Date.now() - new Date(data.created_at).getTime();
  return Math.floor(ms / (24 * 3600 * 1000));
}

export async function upsertLeadByPhone(account_id: string, phone: string) {
  // Try find existing
  const { data: existing } = await supabaseAdmin
    .from('leads')
    .select('id,name,phone,account_id')
    .eq('account_id', account_id)
    .eq('phone', phone)
    .maybeSingle();
  if (existing) return existing;
  // Create
  const { data, error } = await supabaseAdmin
    .from('leads')
    .insert({ account_id, phone, name: null, status: 'pending' })
    .select('id,name,phone,account_id')
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getAccountByPhone(toNumber: string) {
  // Try map by account_sms_config.from_number
  const { data } = await supabaseAdmin
    .from('account_sms_config' as any)
    .select('account_id, from_number')
    .eq('from_number', toNumber)
    .maybeSingle();
  if (data?.account_id) return { account_id: data.account_id };
  // Fallback: single-tenant default (replace with your default account if needed)
  return { account_id: '11111111-1111-1111-1111-111111111111' };
}

export async function pickInitialVariant(account_id: string, track: 'new'|'old') {
  // Simple: use template_opener for both tracks for now
  const { data } = await supabaseAdmin
    .from('app_settings')
    .select('brand, template_opener')
    .eq('account_id', account_id)
    .maybeSingle();
  return { variant: 'A', body: (data?.template_opener || 'Hi {{first_name}}—{{brand}} here. Can I share a quick booking link?').replace('{{brand}}', data?.brand || 'OutboundRevive') };
}

export async function getKB(account_id: string): Promise<Array<{ tag?: string; title?: string; body: string }>> {
  const { data } = await supabaseAdmin
    .from('account_kb_articles')
    .select('title,body,tags')
    .eq('account_id', account_id)
    .eq('is_active', true)
    .limit(10);
  return (data || []).map((r: any) => ({ tag: (r.tags?.[0] || 'kb'), title: r.title || '', body: r.body || '' }));
}

export async function getObjections(account_id: string): Promise<Array<{ label: string; script: string }>> {
  const { data } = await supabaseAdmin
    .from('account_kb_articles')
    .select('title,body,tags')
    .eq('account_id', account_id)
    .eq('is_active', true)
    .limit(20);
  const rows = (data || []).filter((r: any) => Array.isArray(r.tags) && r.tags.some((t: string) => String(t).toLowerCase().startsWith('objection')));
  return rows.map((r: any) => ({ label: (r.tags.find((t: string) => String(t).toLowerCase().startsWith('objection')) || 'objection'), script: r.body || '' }));
}

export async function logInbound({ lead_id, body }:{ lead_id: string; body: string }) {
  await supabaseAdmin.from('messages_in').insert({ lead_id, body }).then(() => {});
}

export async function logOutbound({ lead_id, body, provider_sid, meta }:{ lead_id: string; body: string; provider_sid?: string; meta?: any }) {
  await supabaseAdmin.from('messages_out').insert({ lead_id, body, sid: provider_sid || null, ai_source: meta?.variant || null }).then(() => {});
}

export async function recordDeliveryEvent({ messageSid, messageStatus, errorCode }:{ messageSid: string; messageStatus: string; errorCode: any }) {
  await supabaseAdmin.from('deliverability_events').insert({ message_id: null, type: messageStatus || 'unknown', meta_json: { messageSid, errorCode } }).then(() => {});
}

