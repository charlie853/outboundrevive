import { NextRequest, NextResponse } from 'next/server';
import { getUserAndAccountFromRequest } from '@/lib/api/supabase-auth';

/**
 * Require authenticated user and account for email API routes.
 * Returns 401/403 or { accountId }.
 */
export async function requireEmailAccount(
  req: NextRequest
): Promise<{ accountId: string } | NextResponse> {
  const { user, accountId, error } = await getUserAndAccountFromRequest(req, { requireUser: true });
  if (error || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!accountId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return { accountId };
}
