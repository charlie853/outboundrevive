"use client";
import { useState } from 'react';

export default function TollFreeReadinessPage() {
  const [form, setForm] = useState({ business_name:'', website:'', contact_email:'', support_hours:'', sample_messages:'', opt_in_description:'' });
  const [ok, setOk] = useState<string|null>(null);
  const [err, setErr] = useState<string|null>(null);
  const [hp, setHp] = useState('');
  const [posting, setPosting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setOk(null); setErr(null);
    try {
      setPosting(true);
      const payload = { ...form, sample_messages: form.sample_messages.split('\n').filter(Boolean), hp };
      const r = await fetch('/api/public/tollfree/apply', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
      const j = await r.json().catch(()=>({}));
      if (!r.ok) throw new Error(j?.error || 'Failed');
      setOk('Thanks—your info was saved.');
      setForm({ business_name:'', website:'', contact_email:'', support_hours:'', sample_messages:'', opt_in_description:'' });
    } catch (e:any) { setErr(e?.message || 'Failed'); }
    finally { setPosting(false); }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-extrabold tracking-tight mb-2">Toll-free readiness</h1>
      <p className="text-gray-700 mb-4">Checklist: business profile, sample messages, opt-in method, support hours, and messaging policy.</p>
      <ul className="list-disc pl-6 text-gray-700 mb-6">
        <li>Business name, website</li>
        <li>Contact email & support hours</li>
        <li>Sample messages (one per line, include STOP/HELP footer in practice)</li>
        <li>Opt-in method (how customers consent)</li>
        <li><a className="underline" href="/messaging-policy">Messaging Policy</a></li>
      </ul>

      <form onSubmit={submit} className="space-y-3">
        <input className="w-full border rounded-md px-3 py-2" placeholder="Business name" value={form.business_name} onChange={(e)=>setForm(f=>({ ...f, business_name:e.target.value }))} />
        <input className="w-full border rounded-md px-3 py-2" placeholder="Website" value={form.website} onChange={(e)=>setForm(f=>({ ...f, website:e.target.value }))} />
        <input className="w-full border rounded-md px-3 py-2" placeholder="Contact email" value={form.contact_email} onChange={(e)=>setForm(f=>({ ...f, contact_email:e.target.value }))} />
        <input className="w-full border rounded-md px-3 py-2" placeholder="Support hours (e.g., Mon–Fri 9–5)" value={form.support_hours} onChange={(e)=>setForm(f=>({ ...f, support_hours:e.target.value }))} />
        <textarea className="w-full border rounded-md px-3 py-2" placeholder="Sample messages (one per line)" rows={4} value={form.sample_messages} onChange={(e)=>setForm(f=>({ ...f, sample_messages:e.target.value }))} />
        <textarea className="w-full border rounded-md px-3 py-2" placeholder="Opt-in description (how users consent)" rows={3} value={form.opt_in_description} onChange={(e)=>setForm(f=>({ ...f, opt_in_description:e.target.value }))} />
        <input type="text" className="hidden" value={hp} onChange={(e)=>setHp(e.target.value)} autoComplete="off" />
        <button className="px-4 py-2 bg-gray-900 text-white rounded-md disabled:opacity-60" disabled={posting}>{posting ? 'Submitting…' : 'Submit'}</button>
      </form>
      {ok && <div className="mt-3 text-green-700">{ok}</div>}
      {err && <div className="mt-3 text-red-700">{err}</div>}
    </div>
  );
}
