import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  const base = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '') || '';
  const sitemap = base ? `${base}/sitemap.xml` : '/sitemap.xml';
  const body = `User-agent: *
Allow: /
Sitemap: ${sitemap}\n`;
  return new NextResponse(body, { headers: { 'Content-Type': 'text/plain' } });
}
