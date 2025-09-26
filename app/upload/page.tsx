'use client';

import { useState } from 'react';
import Papa from 'papaparse';

type LeadRow = { name?: string; phone?: string; email?: string };

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const example = `name,phone,email
Alice,+1 (818) 370-9444,alice@example.com
Bob,555-987-6543,bob@example.com`;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);
    setError(null);
    setRows([]);
    setParsing(true);

    Papa.parse<LeadRow>(f, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setParsing(false);
        // Basic sanity filter: keep objects that have at least a phone field
        const cleaned = (results.data || []).filter(r => r && (r.phone || '').toString().trim() !== '');
        setRows(cleaned);
      },
      error: (err) => {
        setParsing(false);
        setError(err?.message || 'Failed to parse CSV');
      },
    });
  };

  const upload = async () => {
    if (!file) {
      setError('Choose a CSV file first');
      return;
    }
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/ui/import', { method: 'POST', body: fd, cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Upload failed (${res.status})`);
      setResult(json);
    } catch (e: any) {
      setError(e?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <a href="/leads" style={{ textDecoration: 'none', border: '1px solid #ddd', borderRadius: 6, padding: '6px 10px' }}>← Back</a>
        <h1 style={{ margin: 0 }}>Upload Leads CSV</h1>
      </div>

      <p style={{ color: '#666', marginTop: 0 }}>
        Required columns: <code>name</code>, <code>phone</code> (we’ll normalize phone to E.164). Optional: <code>email</code>.<br/>
        Example:
      </p>
      <pre style={{ background: '#f8f9fb', padding: 10, borderRadius: 8, whiteSpace: 'pre-wrap' }}>{example}</pre>

      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 12 }}>
        <input type="file" accept=".csv,text/csv" onChange={handleFileUpload} />
        <button
          onClick={upload}
          disabled={!file || uploading}
          style={{
            padding: '8px 12px',
            border: '1px solid #111',
            borderRadius: 6,
            background: '#111',
            color: '#fff',
            cursor: !file || uploading ? 'not-allowed' : 'pointer',
            opacity: !file || uploading ? 0.6 : 1
          }}
        >
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
        <button
          onClick={() => { setFile(null); setRows([]); setResult(null); setError(null); }}
          style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, background: '#fafafa', cursor: 'pointer' }}
        >
          Clear
        </button>
      </div>

      {parsing && <div style={{ marginTop: 12 }}>Parsing CSV…</div>}
      {error && (
        <div style={{ marginTop: 12, padding: 10, border: '1px solid #f3e0e0', borderRadius: 8, background: '#fff6f6' }}>
          {error}
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ margin: 0 }}>Preview ({rows.length} rows)</h3>
          <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 8 }}>
            <thead>
              <tr>
                {['name','phone','email'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #eee', fontSize: 12, fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 15).map((r, i) => (
                <tr key={i}>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f3f3', fontSize: 12 }}>{r.name || ''}</td>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f3f3', fontSize: 12 }}>{r.phone || ''}</td>
                  <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f3f3', fontSize: 12 }}>{r.email || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 15 && <div style={{ color: '#666', fontSize: 12, marginTop: 6 }}>…showing first 15 of {rows.length}</div>}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 16, padding: 12, border: '1px solid #eee', borderRadius: 8 }}>
          <h3 style={{ marginTop: 0 }}>Result</h3>
          <pre style={{ margin: 0 }}>{JSON.stringify(result, null, 2)}</pre>
          <div style={{ marginTop: 12 }}>
            <a href="/leads" style={{ textDecoration: 'none', border: '1px solid #ddd', borderRadius: 6, padding: '6px 10px', background: '#fafafa' }}>
              View in Leads →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}