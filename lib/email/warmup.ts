/**
 * Warmup provider interface for sending inboxes.
 * MVP: stub returning default limits. Replace with third-party (e.g. Instantly, Lemwarm) later.
 */

export interface WarmupStatus {
  status: 'active' | 'pending' | 'paused' | 'not_configured';
  recommended_daily_limit: number;
  provider_job_id?: string;
  last_sync_at?: string;
}

const DEFAULT_DAILY_LIMIT = 50;

/**
 * Get warmup status for an inbox. Stub: returns not_configured with default limit.
 */
export async function getWarmupStatus(_inboxId: string): Promise<WarmupStatus> {
  return {
    status: 'not_configured',
    recommended_daily_limit: DEFAULT_DAILY_LIMIT,
  };
}

/**
 * Get recommended daily send limit for an inbox (warmup + health).
 * Stub: returns default. Later: call getWarmupStatus and apply min(inbox.daily_limit, warmup.recommended_daily_limit).
 */
export async function getRecommendedDailyLimit(_inboxId: string): Promise<number> {
  return DEFAULT_DAILY_LIMIT;
}
