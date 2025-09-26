import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth:{persistSession:false} });

export async function POST(req: NextRequest, { params }: { params: { accountId: string }}) {
  const want = (process.env.ADMIN_TOKEN || '').trim();
  const got  = (req.headers.get('x-admin-token') || '').trim();
  if (!want || got !== want) return NextResponse.json({ error:'unauthorized' }, { status:401 });

  const accountId = params.accountId;
  const { articles = [], prices = [] } = await req.json();

  if (Array.isArray(articles) && articles.length) {
    const rows = articles.map((a:any) => ({
      account_id: accountId,
      title: String(a.title||'').slice(0,200),
      body: String(a.body||''),
      tags: Array.isArray(a.tags) ? a.tags : [],
      is_active: a.is_active !== false
    }));
    await db.from('account_kb_articles').insert(rows);
  }

  if (Array.isArray(prices) && prices.length) {
    const rows = prices.map((p:any) => ({
      account_id: accountId,
      sku: p.sku || null,
      name: String(p.name||'').slice(0,200),
      description: p.description || null,
      price_cents: Number.isFinite(p.price_cents) ? p.price_cents : null,
      cadence: p.cadence || null,
      min_cents: Number.isFinite(p.min_cents) ? p.min_cents : null,
      max_cents: Number.isFinite(p.max_cents) ? p.max_cents : null,
      region: p.region || null,
      is_active: p.is_active !== false
    }));
    await db.from('account_prices').insert(rows);
  }

  return NextResponse.json({ ok:true });
}