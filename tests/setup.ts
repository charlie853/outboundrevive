/**
 * Test setup - runs before all tests
 */

// Mock environment variables if not set
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';
process.env.DEFAULT_ACCOUNT_ID = process.env.DEFAULT_ACCOUNT_ID || '11111111-1111-1111-1111-111111111111';
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';
process.env.CAL_BOOKING_URL = process.env.CAL_BOOKING_URL || 'https://cal.com/test';
process.env.BRAND = process.env.BRAND || 'TestBrand';
process.env.TWILIO_DISABLE = process.env.TWILIO_DISABLE || '1'; // Disable real Twilio in tests

// Increase timeout for integration tests
jest.setTimeout(30000);

