import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseServer';

/**
 * GoHighLevel OAuth - Step 2: Handle callback and exchange code for token
 * 
 * GHL redirects here after user authorizes → we exchange code for access token → save to DB
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Handle authorization denial
    if (error) {
      console.error('[GHL OAuth] User denied authorization:', error);
      return NextResponse.redirect(
        `${process.env.PUBLIC_BASE_URL}/integrations?error=ghl_denied`
      );
    }

    if (!code || !state) {
      console.error('[GHL OAuth] Missing code or state parameter');
      return NextResponse.redirect(
        `${process.env.PUBLIC_BASE_URL}/integrations?error=ghl_invalid_callback`
      );
    }

    // Decode state to get accountId and userId
    let accountId: string;
    let userId: string;
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
      accountId = decoded.accountId;
      userId = decoded.userId;
    } catch (e) {
      console.error('[GHL OAuth] Invalid state parameter:', e);
      return NextResponse.redirect(
        `${process.env.PUBLIC_BASE_URL}/integrations?error=ghl_invalid_state`
      );
    }

    // Get OAuth credentials
    const clientId = process.env.GOHIGHLEVEL_CLIENT_ID;
    const clientSecret = process.env.GOHIGHLEVEL_CLIENT_SECRET;
    const redirectUri = `${process.env.PUBLIC_BASE_URL}/api/oauth/gohighlevel/callback`;

    if (!clientId || !clientSecret) {
      console.error('[GHL OAuth] Missing client credentials');
      return NextResponse.redirect(
        `${process.env.PUBLIC_BASE_URL}/integrations?error=ghl_config_missing`
      );
    }

    // Exchange authorization code for access token
    console.log('[GHL OAuth] Exchanging code for token...');
    const tokenResponse = await fetch('https://services.leadconnectorhq.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('[GHL OAuth] Token exchange failed:', errorText);
      return NextResponse.redirect(
        `${process.env.PUBLIC_BASE_URL}/integrations?error=ghl_token_failed`
      );
    }

    const tokenData = await tokenResponse.json();
    const { access_token, refresh_token, expires_in, scope, locationId, companyId, userId: ghlUserId } = tokenData;

    if (!access_token) {
      console.error('[GHL OAuth] No access token in response:', tokenData);
      return NextResponse.redirect(
        `${process.env.PUBLIC_BASE_URL}/integrations?error=ghl_no_token`
      );
    }

    console.log('[GHL OAuth] Token received successfully');

    // Generate a unique connection ID (similar to Nango's format)
    const connectionId = `ghl_${accountId}_${Date.now()}`;

    // Save to crm_connections table
    const { error: insertError } = await supabaseAdmin
      .from('crm_connections')
      .insert({
        account_id: accountId,
        provider: 'gohighlevel',
        nango_connection_id: connectionId,
        connection_metadata: {
          access_token, // Store token in metadata
          refresh_token,
          expires_in,
          scope,
          locationId,
          companyId,
          userId: ghlUserId,
          created_at: new Date().toISOString(),
        },
        is_active: true,
      });

    if (insertError) {
      console.error('[GHL OAuth] Failed to save connection:', insertError);
      return NextResponse.redirect(
        `${process.env.PUBLIC_BASE_URL}/integrations?error=ghl_save_failed`
      );
    }

    // Also save to user_data for backwards compatibility
    await supabaseAdmin
      .from('user_data')
      .update({
        nango_token: access_token,
        crm: 'gohighlevel',
      })
      .eq('user_id', userId);

    console.log(`[GHL OAuth] ✅ Connection saved for account ${accountId}`);

    // Redirect back to integrations page with success
    return NextResponse.redirect(
      `${process.env.PUBLIC_BASE_URL}/integrations?success=ghl_connected`
    );
    
  } catch (error) {
    console.error('[GHL OAuth] Callback error:', error);
    return NextResponse.redirect(
      `${process.env.PUBLIC_BASE_URL}/integrations?error=ghl_unknown`
    );
  }
}

