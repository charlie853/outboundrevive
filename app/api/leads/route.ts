// app/api/leads/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// ---- helpers -------------------------------------------------
function toE164Loose(raw?: string | null) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\+\d{8,15}$/.test(s)) return s; // already E.164
  const digits = s.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

type IncomingLead = { name?: string; phone?: string; email?: string };

// ---- POST /api/leads  (bulk JSON upsert) ---------------------
export async function POST(req: NextRequest) {
  try {
    const rows = (await req.json()) as IncomingLead[];
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
    }

    const cleaned = rows
      .map((r) => {
        const phone = toE164Loose(r.phone);
        if (!phone) return null;
        return {
          name: (r.name || '').toString().trim() || null,
          phone,
          email: r.email ? String(r.email).trim() : null,
          status: 'pending' as const,
        };
      })
      .filter(Boolean) as Array<{ name: string | null; phone: string; email: string | null; status: 'pending' }>;

    if (cleaned.length === 0) {
      return NextResponse.json({ error: 'No valid phone numbers after normalization' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('leads')
      .upsert(cleaned, { onConflict: 'phone' })
      .select();

    if (error) {
      console.error('Supabase insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ inserted: data?.length ?? 0, sample: data?.slice(0, 3) ?? [] });
  } catch (e) {
    console.error('POST /api/leads error:', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// ---- GET /api/leads  (list) ---------------------------------
export async function GET(_req: NextRequest) {
  try {
    const { data, error } = await supabaseAdmin
      .from('leads')
      .select(`
        id,name,phone,status,replied,intent,created_at,
        sent_at,last_message_sid,delivery_status,error_code,
        opted_out,step,last_step_at,last_reply_at,last_reply_body,
        appointment_set_at
      `)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('Supabase list error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data: data ?? [] });
  } catch (e) {
    console.error('GET /api/leads error:', e);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// ---- PATCH /api/leads  (admin-only: update a lead) ----------
export async function PATCH(req: NextRequest) {
  const want = (process.env.ADMIN_TOKEN || '').trim();
  const got  = (req.headers.get('x-admin-token') || '').trim();
  if (!want || got !== want) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const id = String(body.id || '').trim();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const allowed = [
      'status','step','last_step_at','replied','intent','opted_out',
      'sent_at','name','phone','email','booked','kept'
      // (intentionally not exposing appointment_set_at here)
    ];
    const update: Record<string, any> = {};
    for (const k of allowed) {
      if (k in body) update[k] = body[k];
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'no valid fields to update' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('leads')
      .update(update)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'Invalid JSON' }, { status: 400 });
  }
}