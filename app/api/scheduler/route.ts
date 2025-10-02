// app/api/scheduler/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseServer';
import { requireAdmin } from '@/lib/admin';

export const runtime = 'nodejs';

// use admin client with build-safe env fallbacks

function withinQuietHours(now: Date, tz: string, startHHMM: string, endHHMM: string) {
  // Simplified: assume server time ~ local; you already store HH:MM
  const [sh, sm] = startHHMM.split(':').map(Number);
  const [eh, em] = endHHMM.split(':').map(Number);
  const mins = now.getHours() * 60 + now.getMinutes();
  const s = sh * 60 + sm;
  const e = eh * 60 + em;
  if (s <= e) return mins >= s && mins <= e;
  // window crosses midnight
  return mins >= s || mins <= e;
}

function renderTemplate(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

function ensureCompliant(body: string) {
  const t = body.trim();
  if (t.length > 160) throw new Error('Message exceeds 160 characters');
  if (!/txt stop to opt out/i.test(t)) throw new Error('Message must include "Txt STOP to opt out"');
  return t;
}

export async function GET(req: NextRequest) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  // Settings gate
  const { data: s, error: sErr } = await supabase
    .from('app_settings')
    .select('*')
    .eq('id', 'default')
    .maybeSingle();

  if (sErr || !s) return NextResponse.json({ ran: false, reason: 'settings missing' });

  if (s.kill_switch) return NextResponse.json({ ran: false, reason: 'kill switch enabled' });
  if (!s.autopilot_enabled || !s.consent_attested)
    return NextResponse.json({ ran: false, reason: 'autopilot disabled or consent missing' });

  const now = new Date();
  if (!withinQuietHours(now, s.timezone || 'America/New_York', s.quiet_start || '09:00', s.quiet_end || '19:00')) {
    return NextResponse.json({ ran: false, reason: 'outside quiet hours' });
  }

  // How many can we send today?
  const cap = Math.max(1, Number(s.daily_cap || 50));
  // Find pending leads that are not opted out and not replied
  // Step timing rules:
  // - step null/0: eligible immediately
  // - step 1: last_step_at <= now - 24h
  // - step 2: last_step_at <= now - 48h
  const { data: leads, error: lErr } = await supabase
    .rpc('get_autopilot_candidates', { max_take: cap }) as any;

  // If you don’t want a RPC, you can inline a query; using RPC keeps this neat.

  if (lErr) {
    console.error('[scheduler] candidate fetch error', lErr);
    return NextResponse.json({ ran: false, reason: 'db error' });
  }

  if (!leads || leads.length === 0) {
    return NextResponse.json({ ran: false, reason: 'no eligible leads' });
  }

  const dryRun = process.env.TWILIO_DISABLE === '1';
  let sent = 0;

  for (const lead of leads) {
    if (sent >= cap) break;

    try {
      const step: number = lead.step ?? 0;

      // pick template by step
      let tpl = '';
      if (step === 0) tpl = s.template_opener || '';
      else if (step === 1) tpl = s.template_nudge || '';
      else if (step === 2) tpl = s.template_reslot || '';
      else continue; // no more steps

      if (!tpl) continue;

      const vars = {
        name: lead.name || '',
        brand: s.brand || 'OutboundRevive',
        slotA: s.templates?.slotA || '',
        slotB: s.templates?.slotB || '',
        appt_noun: s.templates?.appt_noun || 'appointment',
      };

      // Always append compliance footer if author forgot
      if (!/txt stop to opt out/i.test(tpl)) {
        tpl = `${tpl} Txt STOP to opt out`;
      }

      const body = ensureCompliant(renderTemplate(tpl, vars));

      // Simulate send (or plug real Twilio call later)
      const sid = dryRun ? 'SIM' + Math.random().toString(36).slice(2, 14).toUpperCase() : 'SIM-DRY'; // placeholder

      // Update lead
      await supabase
        .from('leads')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          last_message_sid: sid,
          delivery_status: 'sent',
          step: step + 1,
          last_step_at: new Date().toISOString(),
        })
        .eq('id', lead.id);

      sent++;
    } catch (e: any) {
      console.error('[scheduler] send error', lead?.id, e?.message || e);
    }
  }

  return NextResponse.json({ ran: true, remaining: Math.max(0, cap - sent) });
}
