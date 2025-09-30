import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const routes = [
  '/', '/legal/privacy', '/legal/terms', '/messaging-policy'
];

export async function GET(req: NextRequest) {
  const base = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '') || req.nextUrl.origin;
  const urls = routes.map((p) => `<url><loc>${origin}${p}</loc></url>`).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
  return new NextResponse(xml, { headers: { 'Content-Type': 'application/xml' } });
}
