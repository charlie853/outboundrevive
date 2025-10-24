export const runtime = 'nodejs';
import { NextResponse } from 'next/server';

export async function POST(_req: Request) {
  return NextResponse.json({ ok: true, smoke: 'admin/ai-reply POST reached' });
}
