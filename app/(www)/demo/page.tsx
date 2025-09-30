export default function DemoPage() {
  const base = process.env.CAL_PUBLIC_URL || '';
  // Add extra flags to minimize header/details in the embedded widget
  const cal = base ? `${base}?embed=true&hide_landing_page_details=1&hide_event_type_details=1&hide_gdpr_banner=1&hide_title=1&hide_branding=1&primary_color=111827` : '';
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="grid md:grid-cols-2 gap-8 items-start">
        {/* Left: copy per your wording */}
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Want more appointments?</h1>
          <p className="text-gray-700 mt-3">Request a demo below.</p>
          <p className="text-gray-700">In 10 minutes, we’ll show you exactly where your follow‑up is breaking down—and how to fix it.</p>

          <div className="mt-6">
            <h2 className="text-lg font-semibold">This call is for you if…</h2>
            <div className="mt-3 space-y-3 text-gray-800">
              <div>
                <div className="font-medium">You’re a high‑volume company</div>
                <div className="text-gray-700">You need a system that scales with your lead flow.</div>
              </div>
              <div>
                <div className="font-medium">You’re burning leads</div>
                <div className="text-gray-700">Inconsistent follow‑up is costing you sales.</div>
              </div>
              <div>
                <div className="font-medium">You’re flying blind on ROI</div>
                <div className="text-gray-700">You don’t know which leads are turning into deals.</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: calendar slightly offset */}
        <div className="md:pl-6">
          {cal ? (
            <div className="rounded-2xl overflow-hidden shadow-sm ring-1 ring-black/5 md:ml-4">
              <iframe src={cal} className="w-full h-[900px]" style={{ border: 0 }} loading="lazy" title="Book a demo" />
            </div>
          ) : (
            <p className="text-gray-700">No calendar configured. Please <a className="underline" href="/contact">contact us</a> and we’ll set up a time.</p>
          )}
          {base && (
            <p className="text-center text-sm text-zinc-500 mt-3">
              Trouble loading? <a className="underline" href={base} target="_blank">Open in a new tab</a>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
export const generateMetadata = (): Metadata => pageMeta(
  'Request a Demo — OutboundRevive',
  'See how AI SMS and booking links turn interest into appointments.',
  '/demo'
);
