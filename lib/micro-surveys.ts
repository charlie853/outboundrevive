import { supabaseAdmin as db } from '@/lib/supabaseServer';

type QuestionPolicy = {
  id: string;
  key: string;
  template: string;
  priority: number;
  cooldown_days: number;
  required: boolean;
};

const DEFAULT_QUESTIONS: QuestionPolicy[] = [
  {
    id: 'default-mileage',
    key: 'mileage_band',
    template: 'Quick one—about how many miles are on your ride? <25k / 25-50k / 50-75k / 75k+',
    priority: 100,
    cooldown_days: 45,
    required: false,
  },
  {
    id: 'default-timing',
    key: 'timing_intent',
    template: 'Thinking of upgrading soon or later this year? If soon, I can float options.',
    priority: 90,
    cooldown_days: 30,
    required: false,
  },
  {
    id: 'default-drivers',
    key: 'drivers_in_household',
    template: 'How many drivers regularly use the car at home? 1 / 2 / 3+?',
    priority: 80,
    cooldown_days: 60,
    required: false,
  },
];

function daysBetween(a: string, b: Date) {
  return (b.getTime() - new Date(a).getTime()) / 86_400_000;
}

function mergeQuestions(accountQs?: QuestionPolicy[] | null, verticalQs?: QuestionPolicy[] | null) {
  const map = new Map<string, QuestionPolicy>();
  for (const q of DEFAULT_QUESTIONS) map.set(q.key, q);
  for (const q of verticalQs || []) map.set(q.key, { ...q });
  for (const q of accountQs || []) map.set(q.key, { ...q });
  return Array.from(map.values()).sort((a, b) => b.priority - a.priority);
}

export async function pickMicroSurvey(accountId: string, leadId: string, vertical?: string | null) {
  const [{ data: accountQs }, { data: verticalQs }, { data: facts }, { data: history }] = await Promise.all([
    db
      .from('question_policy')
      .select('id,key,template,priority,cooldown_days,required')
      .eq('account_id', accountId)
      .eq('active', true),
    db
      .from('question_policy')
      .select('id,key,template,priority,cooldown_days,required')
      .is('account_id', null)
      .eq('vertical', vertical || 'auto')
      .eq('active', true),
    db.from('conv_facts').select('key').eq('lead_id', leadId),
    db
      .from('question_history')
      .select('id,key,asked_at,answered')
      .eq('account_id', accountId)
      .eq('lead_id', leadId)
      .order('asked_at', { ascending: false }),
  ]);

  const knownKeys = new Set((facts || []).map((f) => f.key));
  const ordered = mergeQuestions(accountQs, verticalQs);
  const now = new Date();

  for (const policy of ordered) {
    if (!policy.required && knownKeys.has(policy.key)) continue;
    const entries = (history || []).filter((h) => h.key === policy.key);
    if (entries.length) {
      const last = entries[0];
      if (!policy.required && last.answered) continue;
      const cooldown = policy.cooldown_days || 14;
      if (daysBetween(last.asked_at, now) < cooldown) continue;
      const unansweredStreak = entries.slice(0, 2).filter((h) => !h.answered).length;
      if (unansweredStreak >= 2) continue; // auto-snooze ignored question
    }
    return { key: policy.key, template: policy.template };
  }
  return null;
}

export async function recordMicroSurveyAsk(accountId: string, leadId: string, key: string) {
  await db.from('question_history').insert({
    account_id: accountId,
    lead_id,
    key,
    asked_at: new Date().toISOString(),
    answered: false,
  });
}

function normalizeMileage(value: string) {
  const v = value.toLowerCase();
  if (v.includes('75') || v.includes('100') || v.includes('75k') || v.includes('100k')) return '75k+';
  if (v.includes('50')) return '50-75k';
  if (v.includes('25')) return '25-50k';
  if (v.includes('<') || v.includes('under') || v.includes('less')) return '<25k';
  return null;
}

function normalizeTiming(value: string) {
  const v = value.toLowerCase();
  if (v.includes('soon') || v.includes('now') || v.includes('this month') || v.includes('couple') || v.includes('ready')) return '0-3m';
  if (v.includes('summer') || v.includes('fall') || v.includes('later')) return '3-6m';
  if (v.includes('next year') || v.includes('not sure') || v.includes('just looking')) return '6m+';
  return null;
}

function normalizeDrivers(value: string) {
  const num = parseInt(value.replace(/\D+/g, ''), 10);
  if (Number.isFinite(num)) return num >= 3 ? '3+' : String(Math.max(1, num));
  if (value.toLowerCase().includes('three')) return '3+';
  if (value.toLowerCase().includes('two')) return '2';
  if (value.toLowerCase().includes('one') || value.toLowerCase().includes('just me')) return '1';
  return null;
}

function normalizeAnswer(key: string, text: string) {
  if (!text) return null;
  switch (key) {
    case 'mileage_band':
      return normalizeMileage(text);
    case 'timing_intent':
      return normalizeTiming(text);
    case 'drivers_in_household':
      return normalizeDrivers(text);
    default:
      return text.trim() || null;
  }
}

export async function handleMicroSurveyReply(accountId: string, leadId: string, inboundText: string) {
  const { data: pending } = await db
    .from('question_history')
    .select('id,key,asked_at,answered')
    .eq('account_id', accountId)
    .eq('lead_id', leadId)
    .order('asked_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pending || pending.answered) return false;
  const ageHours = (Date.now() - new Date(pending.asked_at).getTime()) / 3_600_000;
  if (ageHours > 96) return false; // stale

  const normalized = normalizeAnswer(pending.key, inboundText);
  if (!normalized) return false;

  await db
    .from('conv_facts')
    .upsert(
      {
        account_id: accountId,
        lead_id: leadId,
        key: pending.key,
        value: normalized,
        confidence: 0.9,
        source: 'micro_survey',
        captured_at: new Date().toISOString(),
      },
      { onConflict: 'lead_id,key' }
    );

  await db
    .from('question_history')
    .update({ answered: true, answered_at: new Date().toISOString(), last_value: normalized })
    .eq('id', pending.id);

  return true;
}


