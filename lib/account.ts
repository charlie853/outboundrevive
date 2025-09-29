import { supabaseAdmin } from './supabaseServer';
import { createClient } from './supabase-server';
import { verifyAuthToken } from './auth-header';
import { headers } from 'next/headers';

export interface UserAccount {
  user_id: string;
  account_id: string;
  role: 'owner' | 'admin' | 'member';
  created_at: string;
}

/**
 * Get the account ID for the current authenticated user
 * Creates a default account if user doesn't have one
 */
export async function getCurrentUserAccountId(): Promise<string | null> {
  let userId: string | null = null;

  try {
    // First try SSR session
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    // Debug logging
    console.log('Server-side auth check:', {
      hasUser: !!user,
      userId: user?.id,
      error: authError?.message
    });

    if (user) {
      userId = user.id;
    }
  } catch (error) {
    console.log('SSR auth failed, trying header auth:', error);
  }

  // If SSR auth failed, try header-based auth
  if (!userId) {
    try {
      const headersList = await headers();
      const authHeader = headersList.get('authorization');
      userId = await verifyAuthToken(authHeader);
      console.log('Header auth result:', { hasUserId: !!userId });
    } catch (error) {
      console.error('Header auth failed:', error);
    }
  }

  if (!userId) {
    console.error('No user found via any auth method');
    return null;
  }

  try {
    // Check if user already has an account
    const { data: userAccount, error: fetchError } = await supabaseAdmin
      .from('user_accounts')
      .select('account_id, role')
      .eq('user_id', userId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = no rows
      console.error('Error fetching user account:', fetchError);
      return null;
    }

    if (userAccount) {
      return userAccount.account_id;
    }

    // User doesn't have an account, create one
    return await createAccountForUser(userId, 'User Account');

  } catch (error) {
    console.error('Error in getCurrentUserAccountId:', error);
    return null;
  }
}

/**
 * Create a new account for a user (typically used during signup)
 */
async function createAccountForUser(userId: string, displayName: string): Promise<string | null> {
  try {
    // Create the account
    const { data: account, error: accountError } = await supabaseAdmin
      .from('accounts')
      .insert({
        name: `${displayName}'s Account`
      })
      .select('id')
      .single();

    if (accountError || !account) {
      console.error('Error creating account:', accountError);
      return null;
    }

    // Link user to account as owner
    const { error: linkError } = await supabaseAdmin
      .from('user_accounts')
      .insert({
        user_id: userId,
        account_id: account.id,
        role: 'owner'
      });

    if (linkError) {
      console.error('Error linking user to account:', linkError);
      return null;
    }

    return account.id;
  } catch (error) {
    console.error('Error creating account for user:', error);
    return null;
  }
}

/**
 * Get all accounts a user has access to
 */
export async function getUserAccounts(): Promise<UserAccount[]> {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return [];
  }

  const { data: userAccounts, error } = await supabaseAdmin
    .from('user_accounts')
    .select(`
      user_id,
      account_id,
      role,
      created_at,
      accounts:account_id (
        name
      )
    `)
    .eq('user_id', user.id);

  if (error) {
    console.error('Error fetching user accounts:', error);
    return [];
  }

  return userAccounts || [];
}

/**
 * Check if current user has access to a specific account
 */
export async function hasAccountAccess(accountId: string): Promise<boolean> {
  let userId: string | null = null;

  try {
    // First try SSR session
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (user) {
      userId = user.id;
    }
  } catch (error) {
    console.log('hasAccountAccess: SSR auth failed, trying header auth');
  }

  // If SSR auth failed, try header-based auth
  if (!userId) {
    try {
      const headersList = await headers();
      const authHeader = headersList.get('authorization');
      userId = await verifyAuthToken(authHeader);
    } catch (error) {
      console.error('hasAccountAccess: Header auth failed:', error);
    }
  }

  if (!userId) {
    return false;
  }

  const { data: userAccount, error } = await supabaseAdmin
    .from('user_accounts')
    .select('account_id')
    .eq('user_id', userId)
    .eq('account_id', accountId)
    .single();

  return !error && !!userAccount;
}

/**
 * Get current user information and account ID
 */
export async function getCurrentUserInfo(): Promise<{ userId: string; email: string | null; accountId: string } | null> {
  let user: any = null;

  try {
    // First try SSR session
    const supabase = await createClient();
    const { data: { user: sessionUser }, error: authError } = await supabase.auth.getUser();

    if (sessionUser) {
      user = sessionUser;
    }
  } catch (error) {
    console.log('SSR auth failed, trying header auth:', error);
  }

  // If SSR auth failed, try header-based auth
  if (!user) {
    try {
      const headersList = await headers();
      const authHeader = headersList.get('authorization');
      const userId = await verifyAuthToken(authHeader);
      if (userId) {
        // We only have userId from token, need to get full user info
        const supabase = await createClient();
        const { data: { user: tokenUser } } = await supabase.auth.getUser();
        user = tokenUser;
      }
    } catch (error) {
      console.error('Header auth failed:', error);
    }
  }

  if (!user) {
    return null;
  }

  // Get account ID for this user
  const accountId = await getCurrentUserAccountId();
  if (!accountId) {
    return null;
  }

  return {
    userId: user.id,
    email: user.email || null,
    accountId
  };
}

/**
 * Middleware helper to ensure user has access to account
 * Returns account_id if authorized, null if not
 */
export async function requireAccountAccess(): Promise<string | null> {
  // getCurrentUserAccountId already does all the work including creating accounts
  // If it returns an account ID, the user has access to it (it's their account)
  return await getCurrentUserAccountId();
}