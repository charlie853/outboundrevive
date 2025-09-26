// lib/admin.ts
import { NextRequest, NextResponse } from 'next/server';

export function requireAdmin(req: NextRequest): NextResponse | null {
  const got = req.headers.get('x-admin-token') || '';
  const expected = process.env.ADMIN_TOKEN || process.env.ADMIN_API_KEY || '';
  if (!expected || got !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}