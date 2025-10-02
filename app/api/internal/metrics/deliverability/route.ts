import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabaseServer';
export const runtime='nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const account_id = searchParams.get('account_id') || '11111111-1111-1111-1111-111111111111';
  const days = Number(searchParams.get('days') || 7);
  const since = new Date(Date.now() - days*24*3600*1000).toISOString();

  const { data } = await db
    .from('messages_out')
    .select('sid, provider_status, provider_error_code, created_at, delivered_at, failed_at')
    .eq('account_id', account_id)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(500);

  const delivered = (data||[]).filter(x => x.provider_status === 'delivered').length;
  const failed    = (data||[]).filter(x => x.provider_status === 'failed').length;

  return NextResponse.json({ since, totals: { delivered, failed }, samples: data?.slice(0,50) || [] });
}
