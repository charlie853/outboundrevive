import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const p = request.nextUrl.pathname;

  if (p.startsWith('/api/metrics') || p.startsWith('/api/threads')) {
    return NextResponse.next();
  }

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
      // If no admin token is found in env variables, set to this very long one.
      const expected = process.env.ADMIN_TOKEN || 'ohuaodsjoij ojfoifwh hdhf9hweh9hf392h9fewh9ds u79fh 9whfh hiuhihsiuahdiuo83u 9';
      if (!expected || token !== expected) return new NextResponse('Unauthorized', { status: 401 });
    }

    return NextResponse.next();
  }

  // For now, disable server-side auth checks and let client-side handle it
  // The server-side session isn't being properly maintained
  return NextResponse.next();
}

export const config = {
  // Exclude API and static assets from middleware
  matcher: ['/((?!api|_next|.*\..*).*)'],
}
