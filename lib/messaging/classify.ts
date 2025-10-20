import { getSettings, getLeadAgeDays } from './store';

export type Track = 'new' | 'old' | 'qa';

export async function pickTrack({
  account_id,
  lead,
  inbound,
}: { account_id: string; lead: any; inbound?: string }): Promise<Track> {
  if (inbound && inbound.length) return 'qa';
  const s = await getSettings(account_id);
  const ageDays = await getLeadAgeDays(lead.id);
  const threshold = s.revive_days_threshold ?? 30;
  return ageDays >= threshold ? 'old' : 'new';
}

