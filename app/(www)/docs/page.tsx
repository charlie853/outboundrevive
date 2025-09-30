export default function DocsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-extrabold tracking-tight mb-4">Getting started</h1>
      <ol className="list-decimal pl-6 space-y-2 text-gray-700">
        <li>Import leads (CSV) or connect your CRM.</li>
        <li>Paste knowledge and click Embed to enable grounded replies.</li>
        <li>Connect a messaging number or use dry-run mode.</li>
        <li>Send your first message — the agent can follow up automatically.</li>
      </ol>

      <h2 className="text-xl font-semibold mt-8 mb-2">Compliance (STOP/HELP)</h2>
      <p className="text-gray-700">All messages include opt-out instructions as required. Text STOP to opt out, START to re-subscribe, and HELP for help.</p>

      <h2 className="text-xl font-semibold mt-8 mb-2">Privacy</h2>
      <p className="text-gray-700">We only use your data to deliver the service. See our <a className="underline" href="/legal/privacy">Privacy Policy</a> and <a className="underline" href="/messaging-policy">Messaging Policy</a>.</p>
    </div>
  );
}

import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
export const generateMetadata = (): Metadata => pageMeta(
  'Docs — OutboundRevive',
  'Getting started, compliance (STOP/HELP), and privacy basics.',
  '/docs'
);
