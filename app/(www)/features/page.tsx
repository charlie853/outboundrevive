export default function FeaturesPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-extrabold tracking-tight">Features</h1>
      <div className="grid md:grid-cols-2 gap-6 mt-6">
        <div className="rounded-xl border border-gray-100 p-6 bg-white">
          <h3 className="font-semibold mb-2">Lead imports</h3>
          <p className="text-gray-600 text-sm">Upload CSV or connect your CRM. We normalize phone numbers and dedupe.</p>
        </div>
        <div className="rounded-xl border border-gray-100 p-6 bg-white">
          <h3 className="font-semibold mb-2">SMS deliverability</h3>
          <p className="text-gray-600 text-sm">Quiet hours, footer enforcement, state caps, and status webhooks built-in.</p>
        </div>
        <div className="rounded-xl border border-gray-100 p-6 bg-white">
          <h3 className="font-semibold mb-2">AI drafts</h3>
          <p className="text-gray-600 text-sm">Vector-grounded replies from your knowledge with short SMS caps.</p>
        </div>
        <div className="rounded-xl border border-gray-100 p-6 bg-white">
          <h3 className="font-semibold mb-2">Booking</h3>
          <p className="text-gray-600 text-sm">Tracked links that stamp booked and light up the dashboard instantly.</p>
        </div>
        <div className="rounded-xl border border-gray-100 p-6 bg-white">
          <h3 className="font-semibold mb-2">Metrics</h3>
          <p className="text-gray-600 text-sm">Activity feed, deliverability events, and conversions at a glance.</p>
        </div>
      </div>
    </div>
  );
}

import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
export const generateMetadata = (): Metadata => pageMeta(
  'Features — OutboundRevive',
  'Lead imports, policy‑safe SMS, AI drafts, booking and metrics.',
  '/features'
);
