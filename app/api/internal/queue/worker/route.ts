import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { sendSms } from '@/lib/twilio';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const adminHeader = (req.headers.get('x-admin-token') || '').trim();
    const adminWant = (process.env.ADMIN_API_KEY?.trim() || '') || (process.env.ADMIN_TOKEN?.trim() || '');
    if (!adminHeader || !adminWant || adminHeader !== adminWant) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const nowIso = new Date().toISOString();
    // Pick ready items (small batch)
    const { data: items, error } = await supabaseAdmin
      .from('send_queue')
      .select('id, account_id, lead_id, body, attempt, max_attempts')
      .eq('status', 'queued')
      .lte('run_after', nowIso)
      .order('run_after', { ascending: true })
      .limit(10);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const results: any[] = [];
    for (const it of items || []) {
      // flip to processing
      await supabaseAdmin.from('send_queue').update({ status: 'processing', updated_at: nowIso }).eq('id', it.id).eq('status', 'queued');
      try {
        // Resolve phone
        const { data: lead } = await supabaseAdmin
          .from('leads')
          .select('id, phone')
          .eq('id', it.lead_id)
          .eq('account_id', it.account_id)
          .maybeSingle();
        if (!lead?.phone) throw new Error('no_phone');
        const r = await sendSms({ to: lead.phone, body: it.body });
        // mark sent
        await supabaseAdmin.from('send_queue').update({ status: 'sent', updated_at: new Date().toISOString() }).eq('id', it.id);
        results.push({ id: it.id, sent: true, sid: r?.sid });
      } catch (e: any) {
        const attempt = (it.attempt || 0) + 1;
        let status: 'queued'|'failed'|'dead_letter' = 'queued';
        let run_after: string | null = null;
        if (attempt >= (it.max_attempts || 5)) {
          status = 'dead_letter';
        } else {
          status = 'queued';
          const backoffSec = Math.min(60 * 15, Math.pow(2, attempt) * 5); // cap at 15m
          run_after = new Date(Date.now() + backoffSec * 1000).toISOString();
        }
        await supabaseAdmin
          .from('send_queue')
          .update({ status, error: e?.message || 'send_error', attempt, run_after: run_after || undefined, updated_at: new Date().toISOString() })
          .eq('id', it.id);
        results.push({ id: it.id, sent: false, error: e?.message });
      }
    }
    return NextResponse.json({ ok: true, processed: results.length, results });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'server_error' }, { status: 500 });
  }
}


