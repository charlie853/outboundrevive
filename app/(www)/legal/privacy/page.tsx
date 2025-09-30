export default function PrivacyPage() {
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 16px' }}>
      <h1>Privacy Policy</h1>
      <p>This is a placeholder. Your privacy matters.</p>
    </div>
  );
}

import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
export const generateMetadata = (): Metadata => pageMeta(
  'Privacy — OutboundRevive',
  'We only use your data to deliver the service. Contact support@outboundrevive.com.',
  '/legal/privacy'
);
