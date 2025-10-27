import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const p = req.nextUrl.pathname;

  // Bypass API routes and framework/static assets
  if (
    p.startsWith('/api/') ||
    p.startsWith('/_next/') ||
    p === '/favicon.ico' ||
    p.startsWith('/assets/') ||
    p.startsWith('/static/')
  ) {
    return NextResponse.next();
  }

  // TODO: add any auth/redirect logic for app pages here
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/|favicon.ico|assets/|static/).*)'],
};
