type NullableString = string | null | undefined;

export type LeadBucket = 'new_lead' | 'cold_lead' | 'deal_in_progress' | 'existing_or_former_client';

export interface LeadClassificationInput {
  lead_type?: NullableString;
  crm_status?: NullableString;
  crm_stage?: NullableString;
  crm_description?: NullableString;
}

const BUCKET_LABELS: Record<LeadBucket, string> = {
  new_lead: 'New lead',
  cold_lead: 'Cold / old lead',
  deal_in_progress: 'Deal in progress',
  existing_or_former_client: 'Existing or former client',
};

export function determineLeadBucket(info: LeadClassificationInput): { bucket: LeadBucket; label: string; reason: string } {
  const { lead_type, crm_status, crm_stage, crm_description } = info;
  const type = (lead_type || '').toLowerCase();
  const status = (crm_status || '').toLowerCase();
  const stage = (crm_stage || '').toLowerCase();
  const description = (crm_description || '').toLowerCase();
  const combined = [type, status, stage, description].join(' ').trim();

  const contains = (needle: string) => combined.includes(needle.toLowerCase());

  const choose = (bucket: LeadBucket, reason: string) => ({
    bucket,
    label: BUCKET_LABELS[bucket],
    reason,
  });

  if (
    type === 'former_client' ||
    contains('former client') ||
    contains('past client') ||
    contains('reactivate account') ||
    contains('renewal') ||
    contains('upsell') ||
    contains('longtime customer')
  ) {
    return choose('existing_or_former_client', 'CRM data suggests an existing or former client.');
  }

  if (
    type === 'deal_in_progress' ||
    contains('deal in progress') ||
    contains('proposal') ||
    contains('demo') ||
    contains('opportunity') ||
    contains('pipeline') ||
    contains('negotiation') ||
    contains('evaluation') ||
    contains('decision maker')
  ) {
    return choose('deal_in_progress', 'CRM stage indicates an active opportunity.');
  }

  if (
    type === 'old' ||
    contains('cold') ||
    contains('stale') ||
    contains('re-engage') ||
    contains('no-show') ||
    contains('nurture') ||
    contains('previously contacted')
  ) {
    return choose('cold_lead', 'Lead appears to be previously contacted / cold.');
  }

  if (type === 'new') {
    return choose('new_lead', 'Explicitly marked as a new lead.');
  }

  if (!combined) {
    return choose('new_lead', 'No CRM classification found; defaulting to new lead.');
  }

  return choose('new_lead', 'Fallback classification based on limited CRM context.');
}

