import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
import Nav from "@/app/(www)/components/Nav";
import PageShell from "@/app/(www)/components/PageShell";
import SectionHeader from "@/app/(www)/components/SectionHeader";
import OrangeCard from "@/app/(www)/components/OrangeCard";

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Nav />
      <main className="flex-1">
        <PageShell>
          <div className="container mx-auto max-w-4xl px-4 py-16 md:py-24">
            <SectionHeader title="Terms & Conditions" />
            
            <div className="space-y-6">
              <OrangeCard>
                <p className="text-lg text-gray-300">
                  <strong className="text-white">Program:</strong> OutboundRevive SMS
                </p>
              </OrangeCard>

              <OrangeCard>
                <p className="text-lg text-gray-300 leading-relaxed">
                  By opting in, you consent to receive text messages related to your account and services.
                  You must be the account holder or authorized user of the phone number provided.
                </p>
              </OrangeCard>

              <OrangeCard>
                <div className="space-y-4 text-lg text-gray-300">
                  <p>
                    <strong className="text-white">Frequency:</strong> Up to 4 messages per month (unless otherwise stated).
                  </p>
                  <p>
                    <strong className="text-white">Fees:</strong> Message and data rates may apply.
                  </p>
                  <p>
                    <strong className="text-white">Opt-Out:</strong> Reply{' '}
                    <code className="text-amber-400 bg-white/10 px-2 py-1 rounded">PAUSE</code> at any time to pause reminders. Reply{' '}
                    <code className="text-amber-400 bg-white/10 px-2 py-1 rounded">RESUME</code> to continue.
                  </p>
                  <p>
                    <strong className="text-white">Help:</strong> Reply{' '}
                    <code className="text-amber-400 bg-white/10 px-2 py-1 rounded">HELP</code> for assistance or email{' '}
                    <a className="text-amber-400 hover:text-amber-300 transition-colors" href="mailto:support@outboundrevive.com">
                      support@outboundrevive.com
                    </a>.
                  </p>
                </div>
              </OrangeCard>

              <OrangeCard>
                <p className="text-lg text-gray-300 leading-relaxed">
                  <strong className="text-white">Carrier Disclaimer:</strong> Carriers are not liable for delayed or undelivered messages.
                </p>
              </OrangeCard>

              <OrangeCard>
                <p className="text-lg text-gray-300 leading-relaxed">
                  <strong className="text-white">Acceptable Use:</strong> You may not use our services for unlawful, abusive, or prohibited purposes. We may suspend or terminate service for violations.
                </p>
              </OrangeCard>

              <OrangeCard>
                <p className="text-lg text-gray-300 leading-relaxed">
                  <strong className="text-white">Changes:</strong> We may update these terms from time to time. The latest version will always be available on this page.
                </p>
              </OrangeCard>

              <OrangeCard>
                <p className="text-lg text-gray-300 leading-relaxed">
                  See also our{' '}
                  <a className="text-amber-400 hover:text-amber-300 transition-colors" href="/privacy">
                    Privacy Policy
                  </a>.
                </p>
              </OrangeCard>
            </div>
          </div>
        </PageShell>
      </main>
    </div>
  );
}

export const generateMetadata = (): Metadata => pageMeta(
  'Terms & Conditions — OutboundRevive',
  'SMS program terms, consent, frequency, fees, and opt-out.',
  '/terms'
);
