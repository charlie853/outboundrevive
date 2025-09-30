"use client";
import { useEffect, useState } from 'react';

export default function CookieConsent() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_ANALYTICS === 'off') return;
    const ok = localStorage.getItem('or_consented');
    if (!ok) setShow(true);
  }, []);
  if (!show) return null;
  return (
    <div className="fixed bottom-4 inset-x-0 flex justify-center px-4">
      <div className="max-w-3xl w-full rounded-lg border border-gray-200 bg-white shadow p-4 text-sm text-gray-700">
        We use cookies for basic analytics. By using the site, you agree.
        <div className="mt-2 flex gap-2">
          <button className="px-3 py-1 bg-gray-900 text-white rounded" onClick={() => { localStorage.setItem('or_consented','1'); setShow(false); }}>Ok</button>
          <a className="underline" href="/legal/privacy">Privacy</a>
        </div>
      </div>
    </div>
  );
}

