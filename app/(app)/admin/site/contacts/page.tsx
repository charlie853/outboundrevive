'use client';
import { useEffect, useState } from 'react';
import { authenticatedFetch } from '@/lib/api-client';

type Row = { created_at: string; name?: string|null; email: string; message: string; utm_source?: string|null; utm_campaign?: string|null; referrer?: string|null };

export default function ContactsAdmin() {
  const [items, setItems] = useState<Row[]>([]);
  const [err, setErr] = useState<string|null>(null);
  useEffect(() => { (async () => {
    try { const r = await authenticatedFetch('/api/ui/site/contacts'); const j = await r.json(); if (!r.ok) throw new Error(j?.error || 'Failed'); setItems(j.items||[]); } catch(e:any){ setErr(e?.message||'Failed'); }
  })(); }, []);
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-2xl font-bold mb-4">Contacts</h1>
      {err && <div className="text-red-700">{err}</div>}
      <table className="w-full border border-gray-100 text-sm">
        <thead className="bg-gray-50"><tr><th className="p-2 text-left">When</th><th className="p-2 text-left">Name</th><th className="p-2 text-left">Email</th><th className="p-2 text-left">Message</th><th className="p-2 text-left">UTM</th><th className="p-2 text-left">Referrer</th></tr></thead>
        <tbody>
          {items.map((r, i) => (
            <tr key={i} className="border-t"><td className="p-2">{new Date(r.created_at).toLocaleString()}</td><td className="p-2">{r.name||'—'}</td><td className="p-2">{r.email}</td><td className="p-2 whitespace-pre-wrap">{r.message}</td><td className="p-2">{r.utm_source||'—'}</td><td className="p-2 break-all">{r.referrer||'—'}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

