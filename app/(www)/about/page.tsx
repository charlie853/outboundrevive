export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-extrabold tracking-tight mb-4">About</h1>
      <p className="text-gray-700 mb-4">OutboundRevive helps practices turn cold leads into booked appointments using AI SMS follow-ups grounded by your knowledge.</p>
      <p className="text-gray-700">We believe great follow-up should be respectful, compliant, and effective—so you can focus on care, not chasing.</p>
    </div>
  );
}

import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
export const generateMetadata = (): Metadata => pageMeta(
  'About — OutboundRevive',
  'Our mission: respectful, effective SMS follow‑ups that book more appointments.',
  '/about'
);
