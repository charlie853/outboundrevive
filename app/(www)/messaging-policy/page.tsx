import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
import Nav from "@/app/(www)/components/Nav";
import PageShell from "@/app/(www)/components/PageShell";
import SectionHeader from "@/app/(www)/components/SectionHeader";
import OrangeCard from "@/app/(www)/components/OrangeCard";

export default function MessagingPolicyPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Nav />
      <main className="flex-1">
        <PageShell>
          <div className="container mx-auto max-w-4xl px-4 py-16 md:py-24">
            <SectionHeader title="Messaging Policy" subtitle="Consent, opt-out, and help keywords." />
            <div className="space-y-6">
              <OrangeCard>
                <ul className="space-y-4 text-lg text-gray-300">
                  <li className="flex items-start">
                    <span className="mr-3 text-amber-400">•</span>
                    <span>Consent/opt-in is required before receiving messages.</span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-3 text-amber-400">•</span>
                    <span>
                      Opt-out: Text <strong className="text-amber-400">PAUSE</strong> to pause reminders;{' '}
                      <strong className="text-amber-400">RESUME</strong> to continue.
                    </span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-3 text-amber-400">•</span>
                    <span>
                      Help: Text <strong className="text-amber-400">HELP</strong> for help.
                    </span>
                  </li>
                  <li className="flex items-start">
                    <span className="mr-3 text-amber-400">•</span>
                    <span>Message frequency varies; Msg&amp;Data rates may apply.</span>
                  </li>
                </ul>
              </OrangeCard>
              <OrangeCard>
                <div className="space-y-4 text-lg text-gray-300">
                  <p>
                    Support:{' '}
                    <a className="text-amber-400 hover:text-amber-300 transition-colors" href="mailto:support@outboundrevive.com">
                      support@outboundrevive.com
                    </a>
                  </p>
                  <p>
                    See our{' '}
                    <a className="text-amber-400 hover:text-amber-300 transition-colors" href="/legal/privacy">
                      Privacy Policy
                    </a>
                    .
                  </p>
                </div>
              </OrangeCard>
            </div>
          </div>
        </PageShell>
      </main>
    </div>
  );
}

export const generateMetadata = (): Metadata => pageMeta(
  'Messaging Policy — OutboundRevive',
  'Consent required. Text PAUSE to pause reminders, RESUME to continue, HELP for help.',
  '/messaging-policy'
);
