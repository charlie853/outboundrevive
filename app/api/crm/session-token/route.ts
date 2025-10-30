import { NextRequest, NextResponse } from 'next/server';
import { Nango } from '@nangohq/node';
import { getCurrentUserInfo } from '@/lib/account';

const nango = new Nango({ secretKey: process.env.NANGO_SECRET_KEY! });

const CRM_INTEGRATIONS = [
  'hubspot',
  'salesforce',
  // 'pipedrive', - annoying to get token for
  'zoho-crm',
  // 'gohighlevel' // TODO: Add when we build direct OAuth (Nango doesn't support it)
];

export async function POST(req: NextRequest) {
  try {
    // Get authenticated user information
    const userInfo = await getCurrentUserInfo();
    if (!userInfo) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId, email, accountId } = userInfo;

    console.log('Creating Nango session for authenticated user:', { accountId, userId, email });

    const response = await nango.createConnectSession({
      end_user: {
        id: userId,
        email: email || undefined,
        display_name: email || userId,
        tags: { accountId }
      },
      allowed_integrations: CRM_INTEGRATIONS,
    });

    return NextResponse.json({
      sessionToken: response.data.token
    });
  } catch (error: any) {
    console.error('Error creating Nango session token:', JSON.stringify(error));
    
    return NextResponse.json(
      { 
        error: 'Failed to create session token',
        details: error.response?.data || error.message
      },
      { status: 500 }
    );
  }
}
