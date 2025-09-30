"use client";

import Cal from '@calcom/embed-react';

export default function BookingEmbed({ calLink }: { calLink: string }) {
  if (!calLink) return null;
  // calLink should be like "charlie-fregozo-v8sczt/30min"
  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="rounded-2xl overflow-hidden shadow-soft ring-1 ring-surface-line/60 bg-white">
        <Cal
          calLink={calLink}
          style={{ width: '100%', height: '900px' }}
          config={{ hideEventTypeDetails: true, theme: 'light' }}
        />
      </div>
    </div>
  );
}
