/**
 * Helper to create auth headers for API requests
 * This works around SSR session issues by sending the token directly
 */

import { supabase } from './supabase';

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    return {};
  }

  return {
    'Authorization': `Bearer ${session.access_token}`,
  };
}

/**
 * Verify auth token from request headers (for API routes)
 */
import { supabaseAdmin } from './supabaseServer';

export async function verifyAuthToken(authHeader: string | null): Promise<string | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return null;
    }

    return user.id;
  } catch (error) {
    console.error('Error verifying auth token:', error);
    return null;
  }
}