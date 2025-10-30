// Backfill segments_used in tenant_billing from historical messages
// Usage: ts-node scripts/backfill_segments.ts

import 'isomorphic-fetch';

const URL = process.env.SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function listAccounts(): Promise<string[]> {
  const r = await fetch(`${URL}/rest/v1/accounts?select=id`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!r.ok) return [];
  const rows = await r.json().catch(() => []);
  return (rows as Array<{ id: string }>).map(x => x.id);
}

async function sumSegments(table: 'messages_in' | 'messages_out', accountId: string, sinceISO: string): Promise<number> {
  const r = await fetch(`${URL}/rest/v1/${table}?select=segments&account_id=eq.${encodeURIComponent(accountId)}&created_at=gte.${encodeURIComponent(sinceISO)}&segments=not.is.null`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!r.ok) return 0;
  const rows = await r.json().catch(() => []);
  return (rows as Array<{ segments: number }>).reduce((acc, row) => acc + (row.segments || 0), 0);
}

async function updateBilling(accountId: string, used: number) {
  await fetch(`${URL}/rest/v1/tenant_billing?account_id=eq.${encodeURIComponent(accountId)}`, {
    method: 'PATCH',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ segments_used: used, updated_at: new Date().toISOString() }),
  });
}

async function main() {
  if (!URL || !KEY) throw new Error('Supabase env missing');
  const sinceISO = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(); // start of month
  const accounts = await listAccounts();
  for (const accountId of accounts) {
    const [inSegs, outSegs] = await Promise.all([
      sumSegments('messages_in', accountId, sinceISO),
      sumSegments('messages_out', accountId, sinceISO),
    ]);
    const total = inSegs + outSegs;
    console.log(JSON.stringify({ event: 'backfill_segments', account_id: accountId, since: sinceISO, inSegs, outSegs, total }));
    await updateBilling(accountId, total);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });


