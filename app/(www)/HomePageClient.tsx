"use client";
import { useEffect, useState } from 'react';

export default function HomePageClient() {
  const [email, setEmail] = useState('');
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
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

  async function join(e: React.FormEvent) {
    e.preventDefault(); setOk(null); setErr(null);
    try {
      const r = await fetch('/api/public/waitlist', {
        method: 'POST', headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ email, source: 'hero', hp, ...utm })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || 'Failed');
      setOk('Thanks! You\'re on the list.'); setEmail('');
    } catch (e: any) { setErr(e?.message || 'Failed'); }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <section className="text-center relative overflow-hidden rounded-2xl border border-gray-100 p-10 bg-white">
        <div className="pointer-events-none absolute inset-0 opacity-60" style={{ background: 'radial-gradient(1000px 400px at 50% -10%, #e5e7eb, transparent)' }} />
        <h1 className="relative text-4xl md:text-5xl font-extrabold tracking-tight">AI SMS that turns cold leads into bookings</h1>
        <p className="relative text-lg text-gray-600 mt-2">Revive interest, answer questions from your knowledge, and book time—hands off.</p>
        <div className="mt-5 flex items-center justify-center gap-3">
          <a href="/auth/login" className="px-4 py-2 bg-gray-900 text-white rounded-md shadow">Get started</a>
          <a href="/pricing" className="px-4 py-2 border border-gray-900 rounded-md">See pricing</a>
        </div>
      </section>
      <section className="mt-8 flex items-center justify-center gap-10 opacity-70">
        {[1,2,3,4,5].map((i) => (
          <svg key={i} width="88" height="22" viewBox="0 0 88 22" className="text-gray-300" aria-hidden>
            <rect width="88" height="22" rx="4" fill="currentColor" />
          </svg>
        ))}
      </section>
      <section className="mt-10 grid md:grid-cols-3 gap-4">
        {[
          { t: 'Revives cold leads', d: 'Short, respectful follow‑ups with caps and quiet hours built in.' },
          { t: 'Knowledge‑grounded replies', d: 'Accurate answers pulled from your content—on‑brand and concise.' },
          { t: 'Booking built‑in', d: 'Tracked links stamp BOOKED and light up your dashboard instantly.' },
        ].map((f) => (
          <div key={f.t} className="rounded-xl border border-gray-100 p-6 bg-white text-left">
            <h3 className="font-semibold mb-1">{f.t}</h3>
            <p className="text-gray-600 text-sm">{f.d}</p>
          </div>
        ))}
      </section>
      <section className="mt-12 rounded-xl border border-gray-100 p-6 bg-stone-50 text-center">
        <h3 className="font-semibold">Join the waitlist</h3>
        <form onSubmit={join} className="mt-3 flex items-center justify-center gap-2">
          <input className="w-64 border rounded-md px-3 py-2" placeholder="you@example.com" value={email} onChange={(e)=>setEmail(e.target.value)} required />
          <input type="text" className="hidden" value={hp} onChange={(e)=>setHp(e.target.value)} autoComplete="off" />
          <button className="px-4 py-2 bg-gray-900 text-white rounded-md">Notify me</button>
        </form>
        {ok && <div className="mt-2 text-green-700 text-sm">{ok}</div>}
        {err && <div className="mt-2 text-red-700 text-sm">{err}</div>}
      </section>
    </div>
  );
}

