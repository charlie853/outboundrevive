import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { TRACKING_PIXEL_GIF } from '@/lib/email/tracking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Open tracking pixel. GET /api/email/t/open/[messageId]
 * Records open and returns 1x1 GIF.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return new NextResponse(null, { status: 404 });

  const now = new Date().toISOString();
  await supabaseAdmin
    .from('email_messages')
    .update({ opened_at: now })
    .eq('id', id);

  const { data: row } = await supabaseAdmin
    .from('email_messages')
    .select('thread_id')
    .eq('id', id)
    .single();

  if (row?.thread_id) {
    const { data: thread } = await supabaseAdmin
      .from('email_threads')
      .select('account_id, campaign_id, lead_id')
      .eq('id', row.thread_id)
      .single();
    if (thread) {
      await supabaseAdmin.from('email_events').insert({
        account_id: thread.account_id,
        campaign_id: thread.campaign_id,
        lead_id: thread.lead_id,
        thread_id: row.thread_id,
        message_id: id,
        event_type: 'opened',
        meta: {},
      });
    }
  }

  return new NextResponse(TRACKING_PIXEL_GIF, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
