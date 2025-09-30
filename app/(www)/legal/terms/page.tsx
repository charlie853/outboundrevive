export default function TermsPage() {
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 16px' }}>
      <h1>Terms of Service</h1>
      <p>These are placeholder terms.</p>
    </div>
  );
}

import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
export const generateMetadata = (): Metadata => pageMeta(
  'Terms — OutboundRevive',
  'Standard SaaS terms. Contact support@outboundrevive.com with any questions.',
  '/legal/terms'
);
