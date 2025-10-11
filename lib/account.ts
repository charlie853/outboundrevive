import { supabaseAdmin } from './supabaseServer';
import { createClient } from './supabase-server';

export interface UserAccount {
  user_id: string;
  account_id: string;
  role: 'owner' | 'admin' | 'member';
  created_at: string;
}

/**
 * Get the account ID for the current authenticated user
 */
export async function getCurrentUserAccountId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return null;
    }

    // Get user's account (should exist due to database trigger)
    const { data: userAccount, error: fetchError } = await supabaseAdmin
      .from('user_data')
      .select('account_id')
      .eq('user_id', user.id)
      .single();

    if (fetchError || !userAccount) {
      console.error('Error fetching user account:', fetchError);
      return null;
    }

    return userAccount.account_id;
  } catch (error) {
    console.error('Error in getCurrentUserAccountId:', error);
    return null;
  }
}


/**
 * Get all accounts a user has access to
 */
export async function getUserAccounts(): Promise<UserAccount[]> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return [];
    }

    const { data: userAccounts, error } = await supabaseAdmin
      .from('user_data')
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
  } catch (error) {
    console.error('Error in getUserAccounts:', error);
    return [];
  }
}

/**
 * Check if current user has access to a specific account
 */
export async function hasAccountAccess(accountId: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return false;
    }

    const { data: userAccount, error } = await supabaseAdmin
      .from('user_data')
      .select('account_id')
      .eq('user_id', user.id)
      .eq('account_id', accountId)
      .single();

    return !error && !!userAccount;
  } catch (error) {
    console.error('Error in hasAccountAccess:', error);
    return false;
  }
}

/**
 * Get current user information with account details
 */
export async function getCurrentUserInfo(): Promise<{ userId: string; email: string | null; accountId: string; accountName: string | null } | null> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return null;
    }

    // Get user's account with name
    const { data: userAccount, error: fetchError } = await supabaseAdmin
      .from('user_data')
      .select(`
        account_id,
        accounts:account_id (
          name
        )
      `)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !userAccount) {
      console.error('Error fetching user account info:', fetchError);
      return null;
    }

    return {
      userId: user.id,
      email: user.email || null,
      accountId: userAccount.account_id,
      accountName: (userAccount.accounts as any)?.name || null
    };
  } catch (error) {
    console.error('Error in getCurrentUserInfo:', error);
    return null;
  }
}

/**
 * Middleware helper to ensure user has access to account
 * Returns account_id if authorized, null if not
 */
export async function requireAccountAccess(): Promise<string | null> {
  return await getCurrentUserAccountId();
}