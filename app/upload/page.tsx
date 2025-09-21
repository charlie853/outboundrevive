'use client';
import { useState } from 'react';
import Papa from 'papaparse';

export default function UploadPage() {
  const [leads, setLeads] = useState<any[]>([]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        console.log('Parsed CSV:', results.data);
        setLeads(results.data as any[]);
        // TODO: Send to backend to save to Supabase
      },
    });
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Upload Leads CSV</h1>
      <input type="file" accept=".csv" onChange={handleFileUpload} />
      <ul>
        {leads.map((lead, i) => (
          <li key={i}>{lead.name} - {lead.phone}</li>
        ))}
      </ul>
    </div>
  );
}