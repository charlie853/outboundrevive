"use client";
import { useEffect, useState } from 'react';

export default function ContactClient() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [ok, setOk] = useState<string| null>(null);
  const [err, setErr] = useState<string| null>(null);
  const [posting, setPosting] = useState(false);
  const [hp, setHp] = useState('');
  const [utm, setUtm] = useState<Record<string,string>>({});
  useEffect(() => {
    try {
      const qs = new URLSearchParams(window.location.search);
      const obj: Record<string,string> = {};
      for (const k of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term']) {
        const v = qs.get(k); if (v) obj[k] = v as string;
      }
      obj.referrer = document.referrer || '';
      setUtm(obj);
    } catch {}
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setOk(null); setErr(null);
    try {
      setPosting(true);
      const r = await fetch('/api/public/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, message, hp, ...utm }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || 'Failed');
      setOk('Thanks—We\'ll be in touch.'); setName(''); setEmail(''); setMessage('');
    } catch (e: any) { setErr(e?.message || 'Failed'); }
    finally { setPosting(false); }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-3xl font-extrabold tracking-tight mb-4">Contact</h1>
      <form onSubmit={submit} className="space-y-3">
        <input className="w-full border rounded-md px-3 py-2" placeholder="Name (optional)" value={name} onChange={(e)=>setName(e.target.value)} />
        <input className="w-full border rounded-md px-3 py-2" placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} required />
        <textarea className="w-full border rounded-md px-3 py-2" placeholder="Message" rows={4} value={message} onChange={(e)=>setMessage(e.target.value)} required />
        <input type="text" className="hidden" value={hp} onChange={(e)=>setHp(e.target.value)} autoComplete="off" />
        <button className="px-4 py-2 bg-gray-900 text-white rounded-md disabled:opacity-60" disabled={posting} type="submit">{posting ? 'Sending…' : 'Send'}</button>
      </form>
      {ok && <div className="mt-3 text-green-700">{ok}</div>}
      {err && <div className="mt-3 text-red-700">{err}</div>}
    </div>
  );
}

