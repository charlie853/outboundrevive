// app/api/leads/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { getUserAndAccountFromRequest } from '@/lib/api/supabase-auth';

export const runtime = 'nodejs';

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
    const { accountId, error } = await getUserAndAccountFromRequest(req, { requireUser: true });
    if (!accountId || error) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
          account_id: accountId, // Add account_id to each lead
        };
      })
      .filter(Boolean) as Array<{ name: string | null; phone: string; email: string | null; status: 'pending'; account_id: string }>;

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
export async function GET(req: NextRequest) {
  try {
    const { accountId, error } = await getUserAndAccountFromRequest(req, { requireUser: true });
    if (!accountId || error) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error: listError } = await supabaseAdmin
      .from('leads')
      .select(`
        id,name,phone,status,replied,intent,created_at,
        sent_at,last_message_sid,delivery_status,error_code,
        opted_out,step,last_step_at,last_reply_at,last_reply_body,
        appointment_set_at,crm_owner,crm_owner_email,crm_status,crm_stage,
        crm_description,crm_last_activity_at,company,intro_sent_at
      `)
      .eq('account_id', accountId) // Filter by account
      .order('created_at', { ascending: false })
      .limit(200);

    if (listError) {
      console.error('Supabase list error:', listError);
      return NextResponse.json({ error: listError.message }, { status: 500 });
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
    const { accountId, error } = await getUserAndAccountFromRequest(req, { requireUser: true });
    if (!accountId || error) {
      return NextResponse.json({ error: 'Unauthorized - no account access' }, { status: 401 });
    }

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

    // Update only leads that belong to the user's account
    const { data, error } = await supabaseAdmin
      .from('leads')
      .update(update)
      .eq('id', id)
      .eq('account_id', accountId) // Ensure lead belongs to user's account
      .select()
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'Invalid JSON' }, { status: 400 });
  }
}

// ---- DELETE /api/leads (delete selected) ----------------------
export async function DELETE(req: NextRequest) {
  try {
    const { accountId, error } = await getUserAndAccountFromRequest(req, { requireUser: true });
    if (!accountId || error) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const ids: string[] = Array.isArray(body?.ids)
      ? body.ids.map((id: unknown) => String(id || '').trim()).filter(Boolean)
      : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: 'No lead IDs provided' }, { status: 400 });
    }

    const { count, error } = await supabaseAdmin
      .from('leads')
      .delete({ count: 'exact' })
      .in('id', ids)
      .eq('account_id', accountId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, deleted: count ?? 0 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Invalid JSON' }, { status: 400 });
  }
}
