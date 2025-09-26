import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const p = req.nextUrl.pathname;
  // Public webhooks & dev simulators must stay open
  if (p.startsWith('/api/webhooks/twilio') || p.startsWith('/api/dev/sim')) {
    return NextResponse.next();
  }

  // Protect these routes (adjust as you like)
  const protectedExact = new Set([
    '/api/scheduler',
    '/api/sms/send',
  ]);
  const isSettingsWrite = p === '/api/settings' && req.method !== 'GET';

  if (protectedExact.has(p) || isSettingsWrite) {
    const token = req.headers.get('x-admin-token') || '';
    const expected = process.env.ADMIN_TOKEN || '';
    if (!expected || token !== expected) return new NextResponse('Unauthorized', { status: 401 });
  }

  return NextResponse.next();
}

export const config = { matcher: ['/api/:path*'] };