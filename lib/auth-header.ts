/**
 * Helper to create auth headers for API requests.
 * On the server (no window), return empty headers to avoid importing the client SDK at build time.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  if (typeof window === 'undefined') return {};
  const { supabase } = await import('./supabase');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
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
