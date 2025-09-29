// app/api/internal/blueprints/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export const runtime = 'nodejs';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// GET /api/internal/blueprints  -> list latest blueprints (for debugging)
export async function GET(req: NextRequest) {
  const want = (process.env.ADMIN_TOKEN || '').trim();
  const got  = (req.headers.get('x-admin-token') || '').trim();
  if (!want || got !== want) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);

  const { data, error } = await supabaseAdmin
    .from('account_blueprints')
    .select('id, account_id, vertical, status, created_by, notes, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// POST /api/internal/blueprints
// body: { account_id?: string, vertical: string, sections?: Record<string, any>, notes?: string }
export async function POST(req: NextRequest) {
  const want = (process.env.ADMIN_TOKEN || '').trim();
  const got  = (req.headers.get('x-admin-token') || '').trim();
  if (!want || got !== want) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const account_id = (body.account_id || 'default').toString();
    const vertical   = (body.vertical || 'general').toString();
    const notes      = body.notes ? String(body.notes) : null;
    const sections   = (body.sections && typeof body.sections === 'object') ? body.sections : {};

    const id = crypto.randomUUID(); // ensure id even if DB doesn’t default it

    const { error: bpErr } = await supabaseAdmin
      .from('account_blueprints')
      .insert({
        id, account_id, vertical, status: 'draft', created_by: 'admin', notes
      });

    if (bpErr) {
      return NextResponse.json({ error: bpErr.message }, { status: 500 });
    }

    const secRows = Object.entries(sections).map(([key, data]) => ({
      account_blueprint_id: id,
      key,
      data_json: data
    }));

    if (secRows.length > 0) {
      const { error: secErr } = await supabaseAdmin
        .from('blueprint_sections')
        .insert(secRows);
      if (secErr) {
        return NextResponse.json({ error: secErr.message, blueprint_id: id }, { status: 500 });
      }
    }

    return NextResponse.json({ blueprint_id: id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Invalid JSON' }, { status: 400 });
  }
}