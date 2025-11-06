/**
 * Test utilities for OutboundRevive tests
 */

import { createClient } from '@supabase/supabase-js';

export const TEST_ACCOUNT_ID = process.env.DEFAULT_ACCOUNT_ID || '11111111-1111-1111-1111-111111111111';
export const TEST_ACCOUNT_ID_2 = '22222222-2222-2222-2222-222222222222'; // For isolation tests

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function createTestLead(supabase: ReturnType<typeof getSupabaseAdmin>, accountId: string, phone: string, name?: string) {
  const { data, error } = await supabase
    .from('leads')
    .insert({
      account_id: accountId,
      phone,
      name: name || 'Test Lead',
      status: 'active',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function cleanupTestLead(supabase: ReturnType<typeof getSupabaseAdmin>, leadId: string) {
  // Clean up messages first
  await supabase.from('messages_in').delete().eq('lead_id', leadId);
  await supabase.from('messages_out').delete().eq('lead_id', leadId);
  // Then lead
  await supabase.from('leads').delete().eq('id', leadId);
}

export async function simulateTwilioWebhook(baseUrl: string, from: string, to: string, body: string) {
  try {
    const formData = new URLSearchParams();
    formData.append('From', from);
    formData.append('To', to);
    formData.append('Body', body);
    
    const response = await fetch(`${baseUrl}/api/webhooks/twilio/inbound`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });
    
    const text = await response.text();
    return { status: response.status, text, headers: response.headers };
  } catch (error: any) {
    // If server is not available, return a mock response for testing
    if (error.message?.includes('fetch failed') || error.name === 'AbortError') {
      throw new Error(`Server not available at ${baseUrl}. Start the dev server with 'npm run dev' or set BASE_URL to production.`);
    }
    throw error;
  }
}

export function parseTwiML(twiml: string): { message?: string } {
  const match = twiml.match(/<Message>(.*?)<\/Message>/s);
  return {
    message: match ? match[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"') : undefined,
  };
}

export function extractBookingLink(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s]+/);
  return match ? match[0] : null;
}

export async function waitFor(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function getBaseUrl(): string {
  return process.env.BASE_URL || process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
}

export function isServerAvailable(baseUrl: string): Promise<boolean> {
  // Use node-fetch or native fetch with proper error handling
  return new Promise((resolve) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
      resolve(false);
    }, 2000);
    
    fetch(`${baseUrl}/api/ok`, { 
      signal: controller.signal,
      method: 'GET' 
    })
      .then(r => {
        clearTimeout(timeout);
        resolve(r.ok);
      })
      .catch(() => {
        clearTimeout(timeout);
        resolve(false);
      });
  });
}

