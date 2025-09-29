'use client';

import { supabase } from './supabase';

/**
 * Enhanced fetch that includes auth headers and credentials
 */
export async function authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  // Get current session
  const { data: { session } } = await supabase.auth.getSession();

  const headers = new Headers(options.headers);

  // Add auth header if we have a session
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`);
  }

  // Always include credentials for cookies as fallback
  return fetch(url, {
    ...options,
    credentials: 'same-origin',
    headers
  });
}