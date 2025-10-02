'use client';
import { useEffect, useMemo, useState } from 'react';

export default function BookPage({ params }: any) {
  const [slots, setSlots] = useState<string[]>([]);
  const [picked, setPicked] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [already, setAlready] = useState<string | null>(null);

  // build simple slots: next 5 days, 4/day (10:00, 13:00, 15:00, 17:00) local → ISO UTC
  useEffect(() => {
    const next: string[] = [];
    const hours = [10, 13, 15, 17];
    const now = new Date();
    for (let d = 0; d < 5; d++) {
      const day = new Date(now);
      day.setDate(now.getDate() + d);
      day.setMinutes(0, 0, 0);
      for (const h of hours) {
        const dt = new Date(day);
        dt.setHours(h, 0, 0, 0);
        next.push(new Date(dt.toISOString()).toISOString()); // keep as UTC ISO
      }
    }
    setSlots(next);
    // check current booked status
    (async () => {
      try {
        const r = await fetch(`/api/ui/leads/${params.leadId}/get`, { cache: 'no-store' });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j?.appointment_set_at) setAlready(j.appointment_set_at);
      } catch {}
    })();
  }, []);

  const disabled = !picked;

  const submit = async () => {
    setMsg(null); setErr(null);
    try {
      const r = await fetch(`/api/ui/leads/${params.leadId}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ starts_at: picked, notes })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.detail || j?.error || `HTTP ${r.status}`);
      setMsg('Appointment booked!');
      try {
        localStorage.setItem('leadBooked', JSON.stringify({ id: params.leadId, at: picked, ts: Date.now() }));
      } catch {}
      setAlready(picked);
    } catch (e: any) {
      setErr(e?.message || 'Booking failed');
    }
  };

  const pretty = useMemo(() => (s: string) => new Date(s).toLocaleString(), []);

  return (
    <div style={{ maxWidth: 520, margin: '40px auto', padding: 16 }}>
      <h1 style={{ fontWeight: 700, fontSize: 22, marginBottom: 12 }}>Pick a time</h1>

      {!already && !msg && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          {slots.map((s) => (
            <button
              key={s}
              onClick={() => setPicked(s)}
              style={{
                padding: 10,
                borderRadius: 10,
                border: picked === s ? '2px solid #111' : '1px solid #ddd',
                background: picked === s ? '#111' : '#fff',
                color: picked === s ? '#fff' : '#111',
                cursor: 'pointer'
              }}
            >
              {pretty(s)}
            </button>
          ))}
        </div>
      )}

      {!already && !msg && (
        <textarea
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #ddd', marginBottom: 12 }}
        />
      )}

      {!already && !msg && (
        <button
          onClick={submit}
          disabled={disabled}
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            border: '1px solid #111',
            background: disabled ? '#999' : '#111',
            color: '#fff',
            cursor: disabled ? 'not-allowed' : 'pointer'
          }}
        >
          Book appointment
        </button>
      )}

      {msg && (
        <div style={{ marginTop: 12, color: '#0a7' }}>
          {msg} · <a href="/leads" style={{ color: '#0a7', textDecoration: 'underline' }}>Back to Leads</a>
        </div>
      )}
      {already && (
        <div style={{ marginTop: 12, color: '#0a7' }}>
          Already booked at {new Date(already).toLocaleString()} · <a href="/leads" style={{ color: '#0a7', textDecoration: 'underline' }}>Back to Leads</a>
        </div>
      )}
      {err && <div style={{ marginTop: 12, color: '#b00020' }}>{err}</div>}
    </div>
  );
}
