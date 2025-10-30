// Delete endpoint for compliance (soft delete: mark opted_out + anonymize PII)
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';

export const runtime = 'nodejs';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const accountId = req.headers.get('x-account-id') || process.env.DEFAULT_ACCOUNT_ID || '';

    if (!accountId) return NextResponse.json({ error: 'Missing account_id' }, { status: 400 });

    // Soft delete: anonymize PII, mark opted_out, keep messages for audit
    const { error: updateErr } = await supabaseAdmin
      .from('leads')
      .update({
        name: '[DELETED]',
        email: null,
        company: null,
        role: null,
        opted_out: true,
        updated_at: new Date().toISOString(),
        // Keep phone for deduplication but could hash it in production
      })
      .eq('id', id)
      .eq('account_id', accountId);

    if (updateErr) return NextResponse.json({ error: 'DB error', detail: updateErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, message: 'Lead anonymized and opted out' });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'server_error' }, { status: 500 });
  }
}

