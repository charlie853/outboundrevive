import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const p = request.nextUrl.pathname;

  // Handle existing API protection first
  if (p.startsWith('/api/')) {
    // Public webhooks & dev simulators must stay open
    if (p.startsWith('/api/webhooks/twilio') || p.startsWith('/api/dev/sim')) {
      return NextResponse.next();
    }

    // Protect these routes (adjust as you like)
    const protectedExact = new Set([
      '/api/scheduler',
      '/api/sms/send',
    ]);
    const isSettingsWrite = p === '/api/settings' && request.method !== 'GET';

    if (protectedExact.has(p) || isSettingsWrite) {
      const token = request.headers.get('x-admin-token') || '';
      const expected = process.env.ADMIN_TOKEN || '';
      if (!expected || token !== expected) return new NextResponse('Unauthorized', { status: 401 });
    }

    return NextResponse.next();
  }

  // For now, disable server-side auth checks and let client-side handle it
  // The server-side session isn't being properly maintained
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}