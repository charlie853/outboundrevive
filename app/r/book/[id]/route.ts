// app/r/book/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

// use admin client with build-safe env fallbacks

export async function GET(req: NextRequest, { params }: any) {
  const id = params?.id as string;
  try {
    const now = new Date().toISOString();

    // 1) Stamp the lead
    await supabase
      .from('leads')
      .update({ appointment_set_at: now })
      .eq('id', id);

    // 2) Record a click appointment row (harmless if you end up with multiple clicks)
    await supabase
      .from('appointments')
      .insert({ lead_id: id, status: 'clicked' });

    // 3) Get booking link
    const { data: cfg } = await supabase
      .from('app_settings')
      .select('booking_link,brand')
      .eq('id','default')
      .maybeSingle();

    const raw = cfg?.booking_link || 'https://cal.com/YOURNAME/15min';

    // 4) Add lightweight tracking params (no PII)
    const url = new URL(raw);
    url.searchParams.set('src', 'outboundrevive');
    url.searchParams.set('lead', id);

    return NextResponse.redirect(url.toString(), 302);
  } catch (e) {
    // Safe fallback redirect
    return NextResponse.redirect('https://cal.com/YOURNAME/15min', 302);
  }
}
