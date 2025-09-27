import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
export const runtime='nodejs';
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth:{persistSession:false} });

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