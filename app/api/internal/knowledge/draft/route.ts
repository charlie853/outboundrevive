// Ensure Node runtime so process.env is available
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';

function getHeader(req: Request, name: string) {
  return req.headers.get(name) ?? req.headers.get(name.toLowerCase()) ?? null;
}

function isAuthorized(req: Request) {
  const expected = (process.env.INTERNAL_API_SECRET || '').trim();
  const raw =
    getHeader(req, 'x-internal-secret') ??
    getHeader(req, 'x-internal-api-secret') ??
    (getHeader(req, 'authorization') || '').replace(/^Bearer\s+/i, '');
  const got = (raw || '').trim();
  return !!expected && !!got && got === expected;
}

async function readBody(req: Request): Promise<any> {
  const ct = getHeader(req, 'content-type') || '';
  try {
    if (ct.includes('application/json')) return await req.json();
    if (ct.includes('application/x-www-form-urlencoded')) {
      const form = await req.formData();
      return Object.fromEntries(form.entries());
    }
  } catch {}
  return {};
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const raw = await readBody(req);
  const body = raw?.data ?? raw ?? {};
  const hints = body?.hints ?? body?.hint ?? null;

  // Accept multiple shapes: { q }, { text }, { Body }, camelCase variants
  const q =
    body.q ?? body.text ?? body.Body ?? body.message ?? body.prompt ?? '';

  const account_id =
    body.account_id ?? body.accountId ?? process.env.DEFAULT_ACCOUNT_ID ?? '';

  if (!account_id || !q) {
    return NextResponse.json(
      { error: 'missing_params', need: ['account_id', 'q'] },
      { status: 400 }
    );
  }

  // Minimal LLM call (OpenAI Chat Completions)
  const apiKey = (process.env.OPENAI_API_KEY || '').trim();
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  if (!apiKey) {
    // Return a safe fallback if no key; this still unblocks the webhook UX
    return NextResponse.json({ reply: "Quick note—I'll follow up shortly!" });
  }

  const sys =
    "You are the SMS assistant for OutboundRevive. Reply concisely (<= 2 texts), friendly, and helpful. Avoid links unless asked. If pricing is requested, share a brief, clear summary and offer to book a quick call.";

  const payload = {
    model,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: String(q) }
    ],
    temperature: 0.4,
  };

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    return NextResponse.json({ error: 'llm_error', detail: text.slice(0, 500) }, { status: 502 });
  }

  const data = await resp.json().catch(() => ({}));
  const baseReply =
    data?.choices?.[0]?.message?.content?.trim() ||
    "Thanks for the note—happy to help!";

  let out = baseReply;
  const bookingUrl = hints?.booking_url;
  if (
    hints?.link_allowed &&
    typeof bookingUrl === 'string' &&
    bookingUrl.trim().length &&
    !out.includes(bookingUrl)
  ) {
    out = `${out} ${bookingUrl}`.trim();
  }

  return NextResponse.json({ reply: out });
}
