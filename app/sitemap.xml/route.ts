import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const routes = [
  '/', '/legal/privacy', '/legal/terms', '/messaging-policy'
];

export async function GET(req: NextRequest) {
  const base = (process.env.PUBLIC_BASE_URL || req.nextUrl.origin || 'http://localhost:3000').replace(/\/$/, '');
  const urls = routes.map((p) => `<url><loc>${base}${p}</loc></url>`).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
  return new NextResponse(xml, { headers: { 'Content-Type': 'application/xml' } });
}
