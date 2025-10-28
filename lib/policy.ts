export function normalizePhone(s: string) {
  const raw = (s || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return raw.startsWith('+') ? raw : '';
  if (raw.startsWith('+')) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return `+${digits}`;
}

export function isOptOut(text: string) {
  const t = (text || '').toLowerCase().replace(/[^a-z]/g, '');
  return /(pause|stopall|stop|unsubscribe|cancel|end|quit|remove)/.test(t);
}

export function isHelp(text: string) {
  const t = (text || '').toLowerCase().replace(/[^a-z]/g, '');
  return t.includes('help');
}

export function computeNeedsFooter(lastFooterAtIso?: string | null, nowIso?: string) {
  if (!lastFooterAtIso) return true;
  const now = new Date(nowIso || new Date().toISOString()).getTime();
  const last = new Date(lastFooterAtIso).getTime();
  if (Number.isNaN(now) || Number.isNaN(last)) return true;
  const days = (now - last) / (1000 * 60 * 60 * 24);
  return days > 30;
}

export function withinQuietHours(nowLocalHHMM: string, state?: string | null) {
  const [hStr, mStr] = nowLocalHHMM.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return false;
  const mins = h * 60 + m;
  const start = 8 * 60;
  const end = state === 'FL' || state === 'OK' ? 20 * 60 : 21 * 60;
  return !(mins >= start && mins <= end);
}
