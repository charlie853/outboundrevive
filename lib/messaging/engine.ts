import { pickTrack } from './classify';
import { composeInitial, composeFollowup } from './compose';
import { sendSms } from './send';
import { logOutbound, logInbound } from './store';

export async function routeInbound({ account_id, lead, inbound }:{ account_id: string; lead: any; inbound: string }) {
  await logInbound({ lead_id: lead.id, body: inbound });
  const { text } = await composeFollowup({ account_id, lead, lastInbound: inbound });
  const meta = await sendSms({ account_id, lead, body: text });
  await logOutbound({ lead_id: lead.id, body: text, provider_sid: meta.sid });
  return { text, meta };
}

export async function sendInitialToLead({ account_id, lead }:{ account_id: string; lead: any }) {
  const track = await pickTrack({ account_id, lead });
  const { text, meta: composeMeta } = await composeInitial({ account_id, lead, track });
  const meta = await sendSms({ account_id, lead, body: text });
  await logOutbound({ lead_id: lead.id, body: text, provider_sid: meta.sid, meta: composeMeta });
  return meta;
}

