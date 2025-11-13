import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';

const localEnvPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(localEnvPath)) {
  config({ path: localEnvPath, override: false });
}
config({ override: false });

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const accountId = process.argv[2] || process.env.DEFAULT_ACCOUNT_ID || '11111111-1111-1111-1111-111111111111';

const { data, error } = await supabase
  .from('appointments')
  .select('*')
  .eq('account_id', accountId)
  .order('created_at', { ascending: false })
  .limit(10);

if (error) {
  console.error('Error querying appointments:', error);
  process.exit(1);
}

console.log(JSON.stringify(data, null, 2));

