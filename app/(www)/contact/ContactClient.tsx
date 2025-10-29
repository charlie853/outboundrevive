"use client";
import { useEffect, useState } from 'react';
import Nav from "@/app/(www)/components/Nav";
import PageShell from "@/app/(www)/components/PageShell";
import SectionHeader from "@/app/(www)/components/SectionHeader";
import OrangeCard from "@/app/(www)/components/OrangeCard";

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
        const v = qs.get(k); 
        if (v) obj[k] = v as string;
      }
      obj.referrer = document.referrer || '';
      setUtm(obj);
    } catch {}
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); 
    setOk(null); 
    setErr(null);
    try {
      setPosting(true);
      const r = await fetch('/api/public/contact', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ name, email, message, hp, ...utm }) 
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || 'Failed');
      setOk('Thanks — we\'ll be in touch.'); 
      setName(''); 
      setEmail(''); 
      setMessage('');
    } catch (e: any) { 
      setErr(e?.message || 'Failed'); 
    } finally { 
      setPosting(false); 
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Nav />
      <main className="flex-1">
        <PageShell>
          <div className="container mx-auto max-w-2xl px-4 py-16 md:py-24">
            <SectionHeader
              title="Contact us"
              subtitle="We respond quickly — tell us a bit about your needs."
            />
            <OrangeCard>
              <form onSubmit={submit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Name (optional)</label>
                  <input 
                    className="w-full border border-white/15 rounded-lg px-4 py-3 bg-white/5 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500" 
                    value={name} 
                    onChange={e => setName(e.target.value)} 
                    placeholder="Your name" 
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Email *</label>
                  <input 
                    type="email" 
                    required 
                    className="w-full border border-white/15 rounded-lg px-4 py-3 bg-white/5 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500" 
                    value={email} 
                    onChange={e => setEmail(e.target.value)} 
                    placeholder="you@company.com" 
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Message *</label>
                  <textarea 
                    rows={5} 
                    required 
                    className="w-full border border-white/15 rounded-lg px-4 py-3 bg-white/5 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none" 
                    value={message} 
                    onChange={e => setMessage(e.target.value)} 
                    placeholder="How can we help?" 
                  />
                </div>
                
                <input type="text" className="hidden" value={hp} onChange={e => setHp(e.target.value)} autoComplete="off" />
                
                <button 
                  type="submit" 
                  disabled={posting} 
                  className="w-full btn-amber btn-pill px-6 py-3 font-semibold hover-lift tap-active disabled:opacity-60">
                  {posting ? 'Sending…' : 'Send message'}
                </button>
              </form>

              {ok && (
                <div className="mt-5 p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-green-300">
                  {ok}
                </div>
              )}
              {err && (
                <div className="mt-5 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300">
                  {err}
                </div>
              )}
            </OrangeCard>
          </div>
        </PageShell>
      </main>
    </div>
  );
}

