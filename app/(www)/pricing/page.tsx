import { permanentRedirect } from 'next/navigation';
export default function PricingPage() {
  permanentRedirect('/#book');
}
import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
export const generateMetadata = (): Metadata => pageMeta(
  'Pricing — OutboundRevive',
  'Simple plans. Most teams start with a demo to tailor send volume.',
  '/pricing'
);
