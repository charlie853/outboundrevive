import { NextRequest, NextResponse } from 'next/server';
import { Nango } from '@nangohq/node';
import { getCurrentUserInfo } from '@/lib/account';

const nango = new Nango({ secretKey: process.env.NANGO_SECRET_KEY! });

const CRM_INTEGRATIONS = [
  'hubspot',
  'salesforce',
  'pipedrive',
  'zoho'
];

export async function POST(req: NextRequest) {
  try {
    // Get authenticated user information
    const userInfo = await getCurrentUserInfo();
    if (!userInfo) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId, email, accountId } = userInfo;

    // Optional: allow organizationId from request body for additional tagging
    const body = await req.json().catch(() => ({}));
    const organizationId = body.organizationId;

    console.log('Creating Nango session for authenticated user:', { accountId, userId, email, organizationId });

    const response = await nango.createConnectSession({
      end_user: {
        id: userId,
        email: email || undefined,
        display_name: email || userId,
        tags: { accountId, ...(organizationId ? { organizationId } : {}) }
      },
      allowed_integrations: CRM_INTEGRATIONS,
    });

    return NextResponse.json({
      sessionToken: response.data.token
    });
  } catch (error: any) {
    console.error('Error creating Nango session token:', error);
    console.error('Error response:', error.response?.data);
    console.error('Error status:', error.response?.status);
    
    return NextResponse.json(
      { 
        error: 'Failed to create session token',
        details: error.response?.data || error.message
      },
      { status: 500 }
    );
  }
}