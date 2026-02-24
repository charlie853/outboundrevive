import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { requireEmailAccount } from '@/lib/email/auth';
import { dnsResolveTxt } from '@/lib/email/dns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireEmailAccount(req);
  if (auth instanceof NextResponse) return auth;
  const { accountId } = auth;
  const { id } = await params;

  const { data: row, error: fetchError } = await supabaseAdmin
    .from('email_domains')
    .select('id, domain, dns_status')
    .eq('id', id)
    .eq('account_id', accountId)
    .single();

  if (fetchError || !row) {
    return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
  }

  const domain = row.domain as string;
  const dnsStatus: Record<string, string> = {};

  try {
    const spfRecords = await dnsResolveTxt(domain);
    const spf = spfRecords.find((r) => r.includes('v=spf1'));
    dnsStatus.spf = spf ? 'ok' : 'pending';

    const dmarcRecords = await dnsResolveTxt(`_dmarc.${domain}`);
    const dmarc = dmarcRecords.find((r) => r.includes('v=DMARC1'));
    dnsStatus.dmarc = dmarc ? 'ok' : 'pending';

    dnsStatus.dkim = 'pending';
  } catch (e) {
    dnsStatus.spf = 'fail';
    dnsStatus.dmarc = 'fail';
    dnsStatus.dkim = 'fail';
  }

  const allOk = dnsStatus.spf === 'ok' && dnsStatus.dmarc === 'ok';
  const { error: updateError } = await supabaseAdmin
    .from('email_domains')
    .update({
      dns_status: dnsStatus,
      verified_at: allOk ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .eq('account_id', accountId);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({
    dns_status: dnsStatus,
    verified: allOk,
  });
}
