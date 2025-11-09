#!/usr/bin/env node
/**
 * Test script to send a single SMS via Twilio and verify status callback
 * Usage: node scripts/test-send-sms.mjs +15551234567
 */

const ACC_SID = process.env.TWILIO_ACCOUNT_SID;
const API_KEY = process.env.TWILIO_API_KEY_SID;
const API_SECRET = process.env.TWILIO_API_KEY_SECRET;
const MSID = process.env.TWILIO_MESSAGING_SERVICE_SID;
const BASE_URL = process.env.PUBLIC_BASE_URL || process.env.PUBLIC_BASE || 'https://www.outboundrevive.com';

if (!ACC_SID || !API_KEY || !API_SECRET || !MSID) {
  console.error('❌ Missing Twilio credentials. Set these env vars:');
  console.error('  TWILIO_ACCOUNT_SID');
  console.error('  TWILIO_API_KEY_SID');
  console.error('  TWILIO_API_KEY_SECRET');
  console.error('  TWILIO_MESSAGING_SERVICE_SID');
  process.exit(1);
}

const toPhone = process.argv[2];
if (!toPhone || !toPhone.startsWith('+')) {
  console.error('❌ Usage: node scripts/test-send-sms.mjs +15551234567');
  process.exit(1);
}

const statusCallback = `${BASE_URL}/api/webhooks/twilio/status`;

console.log('📱 Sending test SMS...');
console.log('   To:', toPhone);
console.log('   Status Callback:', statusCallback);
console.log('   Messaging Service SID:', MSID);

const params = new URLSearchParams();
params.append('To', toPhone);
params.append('MessagingServiceSid', MSID);
params.append('Body', `Test SMS from OutboundRevive at ${new Date().toLocaleTimeString()}`);
params.append('StatusCallback', statusCallback);

const auth = Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64');

try {
  const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${ACC_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  const json = await resp.json();

  if (!resp.ok) {
    console.error('❌ Twilio API error:', json);
    process.exit(1);
  }

  console.log('✅ SMS sent successfully!');
  console.log('   SID:', json.sid);
  console.log('   Status:', json.status);
  console.log('   Date Created:', json.date_created);
  console.log('\n💡 Check Vercel logs in ~30 seconds to see if status callback was received.');
  console.log('   Vercel Dashboard → Your Project → Logs');
  console.log('   Search for: [twilio/status]');
} catch (error) {
  console.error('❌ Failed to send SMS:', error);
  process.exit(1);
}

