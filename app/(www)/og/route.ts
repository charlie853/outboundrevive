import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
  <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#1f2937"/>
        <stop offset="100%" stop-color="#0f172a"/>
      </linearGradient>
    </defs>
    <rect width="1200" height="630" fill="url(#g)"/>
    <g fill="#e5e7eb">
      <text x="80" y="320" font-family="Inter, ui-sans-serif" font-size="64" font-weight="800">OutboundRevive</text>
      <text x="80" y="380" font-family="Inter, ui-sans-serif" font-size="32" opacity="0.9">AI SMS follow-up that books patients</text>
    </g>
  </svg>`;
  return new NextResponse(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400, immutable' } });
}

