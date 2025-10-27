export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function envOk() {
  return !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export async function GET() {
  if (!envOk()) {
    return Response.json(
      { ok: false, error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' },
      { status: 500 },
    );
  }

  const url = `${process.env.SUPABASE_URL}/rest/v1/leads?select=id&limit=1`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);

  try {
    const r = await fetch(url, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
        Prefer: 'count=exact',
      },
      cache: 'no-store',
      signal: ctrl.signal,
    });

    const cr = r.headers.get('content-range') ?? null;
    return Response.json({ ok: r.ok, status: r.status, contentRange: cr });
  } catch (e: any) {
    return Response.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  } finally {
    clearTimeout(t);
  }
}
