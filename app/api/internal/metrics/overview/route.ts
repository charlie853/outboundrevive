import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
export const runtime = 'nodejs';
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth:{persistSession:false} });

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const account_id = searchParams.get('account_id') || '11111111-1111-1111-1111-111111111111';
  const days = Number(searchParams.get('days') || 7);
  const since = new Date(Date.now() - days*24*3600*1000).toISOString();

  const { data: out } = await db
    .from('messages_out')
    .select('provider_status')
    .eq('account_id', account_id)
    .gte('created_at', since);

  const { data: replies } = await db
    .from('messages_in')
    .select('id')
    .gte('created_at', since);

  const sent = out?.length ?? 0;
  const delivered = out?.filter(x => x.provider_status === 'delivered')?.length ?? 0;
  const failed = out?.filter(x => x.provider_status === 'failed')?.length ?? 0;
  const replyCount = replies?.length ?? 0;

  return NextResponse.json({
    since, sent, delivered, failed,
    replies: replyCount,
    reply_rate: sent ? +(replyCount / Math.max(delivered,1) * 100).toFixed(1) : 0
  });
}