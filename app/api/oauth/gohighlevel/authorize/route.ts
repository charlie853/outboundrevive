import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserInfo } from '@/lib/account';

/**
 * GoHighLevel OAuth - Step 1: Redirect to GHL authorization
 * 
 * This bypasses Nango and uses direct OAuth with GoHighLevel
 * User clicks "Connect GoHighLevel" → hits this route → redirects to GHL login
 */
export async function GET(req: NextRequest) {
  try {
    // Verify user is authenticated
    const userInfo = await getCurrentUserInfo();
    if (!userInfo) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId, accountId } = userInfo;

    // Get OAuth credentials from env
    const clientId = process.env.GOHIGHLEVEL_CLIENT_ID;
    const redirectUri = `${process.env.PUBLIC_BASE_URL}/api/oauth/gohighlevel/callback`;

    if (!clientId) {
      console.error('GOHIGHLEVEL_CLIENT_ID not configured');
      return NextResponse.json(
        { error: 'GoHighLevel integration not configured' },
        { status: 500 }
      );
    }

    // Build authorization URL
    const authUrl = new URL('https://marketplace.gohighlevel.com/oauth/chooselocation');
    
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', 'contacts.readonly contacts.write locations.readonly');
    
    // Use state parameter to track user session (encode accountId + userId)
    const state = Buffer.from(JSON.stringify({ accountId, userId })).toString('base64url');
    authUrl.searchParams.set('state', state);

    console.log('[GHL OAuth] Redirecting to authorization:', authUrl.toString());

    // Redirect user to GoHighLevel authorization page
    return NextResponse.redirect(authUrl.toString());
    
  } catch (error) {
    console.error('[GHL OAuth] Authorization error:', error);
    return NextResponse.json(
      { error: 'Failed to start GoHighLevel authorization' },
      { status: 500 }
    );
  }
}

