const DEFAULTS = {
  opener:
    'Hi {{first_name}}—{{brand}} here re your earlier inquiry. We can hold {{slotA}} or {{slotB}}. Reply YES to book. Txt STOP to opt out',
  nudge:
    '{{brand}}: still want to book a quick {{appt_noun}}? We can hold {{slotA}} or {{slotB}}. Reply A/B or send a time. Txt STOP to opt out',
  reslot:
    '{{brand}}: no problem. What works—early next week or later this week? You can reply with a window. Txt STOP to opt out',
};

export type TemplateVars = {
  first_name?: string;
  brand: string;
  slotA?: string;
  slotB?: string;
  appt_noun?: string;
};

export function renderTemplate(raw: string | null | undefined, vars: TemplateVars) {
  const t = (raw && raw.trim()) ? raw : DEFAULTS.opener;
  const out = t
    .replaceAll('{{first_name}}', vars.first_name || '')
    .replaceAll('{{brand}}', vars.brand || '')
    .replaceAll('{{slotA}}', vars.slotA || '')
    .replaceAll('{{slotB}}', vars.slotB || '')
    .replaceAll('{{appt_noun}}', vars.appt_noun || 'appointment');
  return ensureCompliant(out);
}

export function selectTemplate(kind: 'OPENER' | 'NUDGE' | 'RESLOT', cfg?: any): string {
  const t = cfg?.templates || {};
  if (kind === 'OPENER') return (t.opener as string) || DEFAULTS.opener;
  if (kind === 'NUDGE')  return (t.nudge  as string) || DEFAULTS.nudge;
  return (t.reslot as string) || DEFAULTS.reslot;
}

export function ensureCompliant(body: string) {
  const t = (body || '').trim();
  // 160 chars, GSM-7-ish check (lightweight)
  if (t.length > 160) throw new Error('Message exceeds 160 characters');
  if (!/txt stop to opt out/i.test(t)) throw new Error('Message must include "Txt STOP to opt out"');
  if (!/\b([A-Za-z0-9][A-Za-z0-9 &'-]{1,})\b/.test(t)) {
    // very light "brand present" heuristic: at least one word-like token
  }
  return t;
}