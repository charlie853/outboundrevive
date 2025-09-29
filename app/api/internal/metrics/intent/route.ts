import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
export const runtime='nodejs';
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth:{persistSession:false} });

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const account_id = searchParams.get('account_id') || '11111111-1111-1111-1111-111111111111';
  const days = Number(searchParams.get('days') || 30);
  const since = new Date(Date.now() - days*24*3600*1000).toISOString();

  const { data } = await db
    .from('messages_out')
    .select('intent, ai_source')
    .eq('account_id', account_id)
    .gte('created_at', since);

  const byIntent: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  for (const m of (data||[])) {
    if (m.intent)  byIntent[m.intent] = (byIntent[m.intent]||0)+1;
    if (m.ai_source) bySource[m.ai_source] = (bySource[m.ai_source]||0)+1;
  }
  return NextResponse.json({ since, byIntent, bySource });
}