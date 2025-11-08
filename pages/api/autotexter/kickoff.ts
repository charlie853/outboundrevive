import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/lib/supabaseServer';
import { queueIntroForLead } from '@/lib/autotexter/queue';

const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  try {
    const { data: settings } = await supabaseAdmin
      .from('account_settings')
      .select('autotexter_enabled')
      .eq('account_id', ACCOUNT_ID)
      .maybeSingle();

    if (!settings?.autotexter_enabled) {
      return res.status(200).json({ ok: false, error: 'autotexter_disabled' });
    }

    const { data: leads, error } = await supabaseAdmin
      .from('leads')
      .select('id, phone, name, email, company, crm_owner, crm_status, crm_stage, crm_description, crm_last_activity_at, intro_sent_at')
      .eq('account_id', ACCOUNT_ID)
      .not('phone', 'is', null)
      .is('intro_sent_at', null)
      .or('last_sent_at.is.null,delivery_status.eq.pending')
      .limit(200);

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    const queuePromises =
      leads?.map((lead) =>
        queueIntroForLead(ACCOUNT_ID, {
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          email: lead.email,
          company: lead.company,
          crm_owner: lead.crm_owner,
          crm_status: lead.crm_status,
          crm_stage: lead.crm_stage,
          crm_description: lead.crm_description,
          crm_last_activity_at: lead.crm_last_activity_at,
          intro_sent_at: lead.intro_sent_at,
        })
      ) ?? [];

    await Promise.allSettled(queuePromises);

    const base =
      process.env.PUBLIC_BASE_URL ||
      process.env.PUBLIC_BASE ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      '';
    const adminToken = (process.env.ADMIN_API_KEY || process.env.ADMIN_TOKEN || '').trim();

    if (base && adminToken) {
      await fetch(`${base.replace(/\/$/, '')}/api/internal/queue/worker`, {
        method: 'POST',
        headers: { 'x-admin-token': adminToken },
      }).catch(() => null);
    }

    res.status(200).json({
      ok: true,
      queued: queuePromises.length,
    });
  } catch (e: any) {
    res.status(200).json({ ok: false, error: String(e?.message || e) });
  }
}
