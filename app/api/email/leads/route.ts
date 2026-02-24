import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { requireEmailAccount } from '@/lib/email/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * List leads for email (account leads with email). Query: campaign_id (leads in that campaign), limit.
 * POST: ingest CSV (array of { email, name?, company? }) - create/update leads and optionally add to campaign.
 */
export async function GET(req: NextRequest) {
  const auth = await requireEmailAccount(req);
  if (auth instanceof NextResponse) return auth;
  const { accountId } = auth;

  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get('campaign_id') || undefined;
  const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500);

  if (campaignId) {
    const { data: threads } = await supabaseAdmin
      .from('email_threads')
      .select('lead_id')
      .eq('account_id', accountId)
      .eq('campaign_id', campaignId);
    const leadIds = [...new Set((threads || []).map((t: any) => t.lead_id))];
    if (leadIds.length === 0) return NextResponse.json({ leads: [] });
    const { data: leads, error } = await supabaseAdmin
      .from('leads')
      .select('id, name, email, company, status, created_at')
      .eq('account_id', accountId)
      .in('id', leadIds.slice(0, limit));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ leads: leads ?? [] });
  }

  const { data, error } = await supabaseAdmin
    .from('leads')
    .select('id, name, email, company, status, created_at')
    .eq('account_id', accountId)
    .not('email', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ leads: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireEmailAccount(req);
  if (auth instanceof NextResponse) return auth;
  const { accountId } = auth;

  const body = await req.json().catch(() => ({}));
  const items = Array.isArray(body.leads) ? body.leads : Array.isArray(body.items) ? body.items : [];
  const campaignId = body.campaign_id || null;
  if (items.length === 0) return NextResponse.json({ error: 'leads array required' }, { status: 400 });

  const created: string[] = [];
  const updated: string[] = [];
  for (const it of items) {
    const email = typeof it.email === 'string' ? it.email.trim().toLowerCase() : null;
    if (!email) continue;
    const name = typeof it.name === 'string' ? it.name.trim() : 'Unknown';
    const phone = it.phone || `email:${email}`;
    const company = typeof it.company === 'string' ? it.company.trim() : null;
    const { data: existing } = await supabaseAdmin
      .from('leads')
      .select('id')
      .eq('account_id', accountId)
      .ilike('email', email)
      .maybeSingle();
    if (existing?.id) {
      await supabaseAdmin.from('leads').update({ name, company }).eq('id', existing.id).eq('account_id', accountId);
      updated.push(existing.id);
    } else {
      const { data: ins } = await supabaseAdmin
        .from('leads')
        .insert({ account_id: accountId, name, email, phone, company })
        .select('id')
        .single();
      if (ins?.id) created.push(ins.id);
    }
  }
  return NextResponse.json({ created: created.length, updated: updated.length, created_ids: created, updated_ids: updated });
}
