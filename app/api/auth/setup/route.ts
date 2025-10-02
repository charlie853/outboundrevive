import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { getCurrentUserAccountId } from '@/lib/account';

/**
 * POST /api/auth/setup
 * Ensures the current authenticated user has an account set up
 * Called after successful login/signup
 */
export async function POST(_req: NextRequest) {
  try {
    const accountId = await getCurrentUserAccountId();

    if (!accountId) {
      return NextResponse.json({ error: 'Failed to create or find account' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      account_id: accountId
    });

  } catch (error) {
    console.error('Error in auth setup:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
