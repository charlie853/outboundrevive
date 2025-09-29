// File: app/api/oauth/nango/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { Nango } from '@nangohq/node';

const NANGO_SECRET_KEY = process.env.NANGO_SECRET_KEY!;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';

export async function GET(req: NextRequest) {
  const clientId = crypto.randomUUID();

  const response = await fetch(`https://api.nango.dev/oauth/connect/hubspot`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NANGO_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      connection_id: clientId,
      provider_config_key: 'hubspot',
      return_url: `${PUBLIC_BASE_URL}/api/oauth/nango/callback?client_id=${clientId}`,
    }),
  });

  let json;
  try {
    const rawText = await response.text();
    console.log('📦 Raw Nango response:', rawText);
    json = JSON.parse(rawText);
  } catch (err) {
    console.error('❌ Failed to parse JSON from Nango. Response body was not valid JSON.');
    return NextResponse.json({ error: 'Failed to parse Nango response.' }, { status: 500 });
  }

  if (!response.ok) {
    console.error('❌ Nango responded with error:', json);
    return NextResponse.json({ error: json }, { status: 500 });
  }

  console.log('➡️ Redirecting to:', json.authorization_url);
  return NextResponse.redirect(json.authorization_url);
}