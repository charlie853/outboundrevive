'use client';

import { useEffect, useMemo, useState } from 'react';

type T = { brand: string; opener: string; nudge: string; reslot: string };

const box = { width:'100%', minHeight:110, padding:8 } as const;
const hint = { color:'#666', fontSize:12 } as const;
const bad  = { ...hint, color:'#b00020' };

function checks(text: string) {
  const len = (text || '').trim().length;
  const stop = /txt stop to opt out/i.test(text || '');
  const hasBrandVar = /\{\{\s*brand\s*\}\}/i.test(text || '');
  return { len, stop, hasBrandVar, ok: len <= 160 && stop && hasBrandVar };
}

export default function TemplatesPage() {
  const [t, setT] = useState<T | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    const r = await fetch('/api/templates', { cache: 'no-store' });
    if (!r.ok) { setErr('Failed to load templates'); return; }
    setT(await r.json());
  }
  useEffect(() => { load(); }, []);

  const openerC = useMemo(() => checks(t?.opener || ''), [t]);
  const nudgeC  = useMemo(() => checks(t?.nudge  || ''), [t]);
  const reslotC = useMemo(() => checks(t?.reslot || ''), [t]);

  const save = async () => {
    if (!t) return;
    setSaving(true); setMsg(null); setErr(null);
    const r = await fetch('/api/templates', {
      method: 'PATCH',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ opener: t.opener, nudge: t.nudge, reslot: t.reslot })
    });
    const j = await r.json().catch(()=>({}));
    if (!r.ok) setErr(j?.error || 'Save failed');
    else setMsg('Saved!');
    setSaving(false);
  };

  if (!t) return <div style={{ padding:24 }}>Loading…{err && <div>{err}</div>}</div>;

  return (
    <div style={{ padding:24, maxWidth:880, margin:'0 auto' }}>
      <h1 style={{ fontSize:22, fontWeight:700, marginBottom:12 }}>Templates</h1>
      <p style={hint}>Use <code>{'{{name}}'}</code> and <code>{'{{brand}}'}</code>. Must be ≤160 chars and include “Txt STOP to opt out”.</p>

      <section style={{ marginTop:16 }}>
        <label>Opener</label>
        <textarea style={box} value={t.opener} onChange={e=>setT({ ...t, opener: e.target.value })} />
        <div style={{ display:'flex', gap:12 }}>
          <span style={openerC.ok ? hint : bad}>Chars: {openerC.len}/160</span>
          {!openerC.stop && <span style={bad}>Missing “Txt STOP to opt out”</span>}
          {!openerC.hasBrandVar && <span style={bad}>Missing {'{{brand}}'}</span>}
        </div>
      </section>

      <section style={{ marginTop:16 }}>
        <label>Nudge</label>
        <textarea style={box} value={t.nudge} onChange={e=>setT({ ...t, nudge: e.target.value })} />
        <div style={{ display:'flex', gap:12 }}>
          <span style={nudgeC.ok ? hint : bad}>Chars: {nudgeC.len}/160</span>
          {!nudgeC.stop && <span style={bad}>Missing “Txt STOP to opt out”</span>}
          {!nudgeC.hasBrandVar && <span style={bad}>Missing {'{{brand}}'}</span>}
        </div>
      </section>

      <section style={{ marginTop:16 }}>
        <label>Reslot</label>
        <textarea style={box} value={t.reslot} onChange={e=>setT({ ...t, reslot: e.target.value })} />
        <div style={{ display:'flex', gap:12 }}>
          <span style={reslotC.ok ? hint : bad}>Chars: {reslotC.len}/160</span>
          {!reslotC.stop && <span style={bad}>Missing “Txt STOP to opt out”</span>}
          {!reslotC.hasBrandVar && <span style={bad}>Missing {'{{brand}}'}</span>}
        </div>
      </section>

      <div style={{ display:'flex', gap:8, marginTop:16 }}>
        <button onClick={save} disabled={saving} style={{ padding:'8px 12px', background:'#111', color:'#fff', border:'1px solid #111', borderRadius:6 }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <a href="/leads" style={{ padding:'8px 12px', border:'1px solid #ddd', borderRadius:6, textDecoration:'none' }}>Back to Leads</a>
      </div>

      {msg && <div style={{ marginTop:10, color:'#0a7f2e' }}>{msg}</div>}
      {err && <div style={{ marginTop:10, color:'#b00020' }}>{err}</div>}
    </div>
  );
}
