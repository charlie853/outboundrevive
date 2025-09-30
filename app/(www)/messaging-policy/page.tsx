export default function MessagingPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-extrabold tracking-tight mb-4">Messaging Policy</h1>
      <ul className="list-disc pl-6 space-y-2 text-gray-700">
        <li>Consent/opt-in is required before receiving messages.</li>
        <li>Opt-out: Text <strong>STOP</strong> to cancel; <strong>START</strong> to re-subscribe.</li>
        <li>Help: Text <strong>HELP</strong> for help.</li>
        <li>Message frequency varies; Msg&amp;Data rates may apply.</li>
        <li>Support: <a className="underline" href="mailto:support@outboundrevive.com">support@outboundrevive.com</a></li>
        <li>See our <a className="underline" href="/legal/privacy">Privacy Policy</a>.</li>
      </ul>
    </div>
  );
}

import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
export const generateMetadata = (): Metadata => pageMeta(
  'Messaging Policy — OutboundRevive',
  'Consent required. Text STOP to cancel, START to re‑subscribe, HELP for help.',
  '/messaging-policy'
);
