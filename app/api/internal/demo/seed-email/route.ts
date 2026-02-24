import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as db } from '@/lib/supabaseServer';
import { requireEmailAccount } from '@/lib/email/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const OUTBOUND_BODY = `Hi Test,

Charlie here — I run Outbound Revive. We help service businesses turn their existing leads and website traffic into booked meetings by running outbound email sequences, SMS follow-up, and a website chatbot that plugs into your current CRM/phone/email setup.

If you're open to it, I'd love to learn how you're handling lead follow-up today (and whether anything is slipping through the cracks) and see if we can help you generate more qualified conversations without adding headcount.

Are you open to a quick call next week to see if this is a fit?

Best,
Charlie`;

const INBOUND_BODY = `Hi Charlie,

Thanks for reaching out. I'm definitely interested — we're pretty swamped and a lot is slipping through the cracks. Can we set up a call? What times work for you next week?`;

const SUBJECT = 'Quick call to see if we can help with lead follow-up';

/**
 * Seed a demo email thread (Charlie → Test, Test replies interested + asks for call)
 * and mark Test as "likely to buy" in scores_next_buy. Idempotent.
 */
export async function POST(req: NextRequest) {
  const auth = await requireEmailAccount(req);
  if (auth instanceof NextResponse) return auth;
  const { accountId } = auth;

  try {
    // 1) Get or create lead Test (test@test.com)
    const email = 'test@test.com';
    let { data: lead } = await db.from('leads').select('id').eq('account_id', accountId).ilike('email', email).maybeSingle();
    if (!lead) {
      const { data: inserted } = await db
        .from('leads')
        .insert({ account_id: accountId, name: 'Test', email, phone: `email:${email}` })
        .select('id')
        .single();
      if (!inserted?.id) return NextResponse.json({ error: 'lead_insert_failed' }, { status: 500 });
      lead = inserted;
    }
    const leadId = lead.id;

    // 2) Get or create domain + inbox (required for thread FK)
    let { data: domain } = await db.from('email_domains').select('id').eq('account_id', accountId).limit(1).maybeSingle();
    if (!domain) {
      const { data: d } = await db.from('email_domains').insert({ account_id: accountId, domain: 'outboundrevive.com' }).select('id').single();
      if (!d?.id) return NextResponse.json({ error: 'domain_insert_failed' }, { status: 500 });
      domain = d;
    }
    let { data: inbox } = await db.from('email_sending_inboxes').select('id').eq('account_id', accountId).limit(1).maybeSingle();
    if (!inbox) {
      const { data: i } = await db
        .from('email_sending_inboxes')
        .insert({ account_id: accountId, domain_id: domain.id, provider: 'smtp', email_address: 'charlie@outboundrevive.com', daily_limit: 50 })
        .select('id')
        .single();
      if (!i?.id) return NextResponse.json({ error: 'inbox_insert_failed' }, { status: 500 });
      inbox = i;
    }
    const sendingInboxId = inbox.id;

    // 3) Get or create campaign + step
    let { data: campaign } = await db.from('email_campaigns').select('id').eq('account_id', accountId).ilike('name', '%Outbound Revive Intro%').limit(1).maybeSingle();
    if (!campaign) {
      const { data: c } = await db.from('email_campaigns').insert({ account_id: accountId, name: 'Outbound Revive Intro', status: 'active' }).select('id').single();
      if (!c?.id) return NextResponse.json({ error: 'campaign_insert_failed' }, { status: 500 });
      campaign = c;
      await db.from('email_campaign_steps').insert({
        campaign_id: campaign.id,
        order_index: 0,
        subject_template: SUBJECT,
        body_template: OUTBOUND_BODY,
        delay_days: 0,
      });
    }
    const campaignId = campaign.id;

    // 4) Get or create thread (tag as "interested" for the reply)
    let { data: thread } = await db
      .from('email_threads')
      .select('id')
      .eq('account_id', accountId)
      .eq('campaign_id', campaignId)
      .eq('lead_id', leadId)
      .eq('sending_inbox_id', sendingInboxId)
      .maybeSingle();
    if (!thread) {
      const { data: t } = await db
        .from('email_threads')
        .insert({
          account_id: accountId,
          campaign_id: campaignId,
          lead_id: leadId,
          sending_inbox_id: sendingInboxId,
          subject: SUBJECT,
          labels: ['interested'],
          last_message_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (!t?.id) return NextResponse.json({ error: 'thread_insert_failed' }, { status: 500 });
      thread = t;
    } else {
      await db.from('email_threads').update({ labels: ['interested'] }).eq('id', thread.id);
    }
    const threadId = thread.id;

    // 5) Get or create messages (out then in)
    const { data: existingMessages } = await db.from('email_messages').select('id').eq('thread_id', threadId);
    if (!existingMessages?.length) {
      const now = new Date().toISOString();
      const dayAgo = new Date(Date.now() - 86400000).toISOString();
      await db.from('email_messages').insert([
        { thread_id: threadId, direction: 'out', subject: SUBJECT, body_plain: OUTBOUND_BODY, sent_at: dayAgo, created_at: dayAgo },
        { thread_id: threadId, direction: 'in', subject: `Re: ${SUBJECT}`, body_plain: INBOUND_BODY, sent_at: now, created_at: now },
      ]);
      await db.from('email_threads').update({ last_message_at: now }).eq('id', threadId);
    }

    // 6) Events so stats load (sent, replied)
    const { data: events } = await db.from('email_events').select('id').eq('account_id', accountId).eq('thread_id', threadId);
    if (!events?.length) {
      const dayAgo = new Date(Date.now() - 86400000).toISOString();
      const now = new Date().toISOString();
      await db.from('email_events').insert([
        { account_id: accountId, campaign_id: campaignId, lead_id: leadId, thread_id: threadId, event_type: 'sent', created_at: dayAgo },
        { account_id: accountId, campaign_id: campaignId, lead_id: leadId, thread_id: threadId, event_type: 'replied', created_at: now },
      ]);
    }

    // 7) Mark Test as "likely to buy" (scores_next_buy). Table has "window" (schema); app may use window_bucket.
    const reason = { source: 'email_reply', summary: 'Replied interested, asked for call' };
    await db
      .from('scores_next_buy')
      .upsert(
        {
          account_id: accountId,
          lead_id: leadId,
          score: 0.92,
          window: '0-3m',
          reason_json: reason,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'account_id,lead_id' }
      )
      .select('id')
      .single();

    return NextResponse.json({ ok: true, thread_id: threadId, lead_id: leadId });
  } catch (e: any) {
    console.error('[demo/seed-email]', e);
    return NextResponse.json({ error: 'seed_failed', detail: e?.message || String(e) }, { status: 500 });
  }
}
