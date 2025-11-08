import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

function toE164(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (raw.startsWith('+')) return raw;
  return `+${digits}`;
}

const inputPhones = process.argv.slice(2);
if (inputPhones.length === 0) {
  console.error('Usage: node scripts/delete-leads.mjs <phone1> <phone2> ...');
  process.exit(1);
}

const phones = inputPhones.map(toE164).filter(Boolean);
if (phones.length === 0) {
  console.error('No valid phone numbers provided.');
  process.exit(1);
}

const accountId = '11111111-1111-1111-1111-111111111111';

async function deleteLeadData() {
  try {
    console.log('Phones normalized:', phones);

    const { data: leads, error: leadLookupError } = await supabase
      .from('leads')
      .select('id, phone')
      .eq('account_id', accountId)
      .in('phone', phones);

    if (leadLookupError) throw leadLookupError;
    if (!leads || leads.length === 0) {
      console.log('No leads found for those phone numbers.');
      return;
    }

    const leadIds = leads.map((l) => l.id);
    console.log('Found lead IDs:', leadIds);

    const { error: messagesError, count: messagesDeleted } = await supabase
      .from('messages_out')
      .delete({ count: 'exact' })
      .in('lead_id', leadIds)
      .eq('account_id', accountId);

    if (messagesError) throw messagesError;
    console.log(`Deleted ${messagesDeleted ?? 0} outbound messages`);

    const { error: leadDeleteError, count: leadsDeleted } = await supabase
      .from('leads')
      .delete({ count: 'exact' })
      .in('id', leadIds)
      .eq('account_id', accountId);

    if (leadDeleteError) throw leadDeleteError;
    console.log(`Deleted ${leadsDeleted ?? 0} leads`);
  } catch (error) {
    console.error('Deletion failed:', error);
    process.exit(1);
  }
}

await deleteLeadData();

