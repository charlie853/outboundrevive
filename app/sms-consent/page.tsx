import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
import Nav from "@/app/(www)/components/Nav";
import PageShell from "@/app/(www)/components/PageShell";
import SectionHeader from "@/app/(www)/components/SectionHeader";
import OrangeCard from "@/app/(www)/components/OrangeCard";

export default function SMSConsentPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Nav />
      <main className="flex-1">
        <PageShell>
          <div className="container mx-auto max-w-4xl px-4 py-16 md:py-24">
            <SectionHeader 
              title="SMS Consent Disclosure" 
              subtitle="How we collect SMS consent, frequency, PAUSE/HELP, and sample messages."
            />
            
            <div className="space-y-6">
              <OrangeCard>
                <div className="space-y-4 text-lg text-gray-300">
                  <p>
                    <strong className="text-white">Program:</strong> OutboundRevive SMS
                  </p>
                  <p>
                    <strong className="text-white">Who Receives Messages:</strong> Existing and past clients who provide explicit consent via our web form.
                  </p>
                  <p>
                    <strong className="text-white">How We Collect Consent:</strong> An unchecked checkbox on our form. By checking the box, you agree to receive SMS from OutboundRevive.
                  </p>
                </div>
              </OrangeCard>

              <OrangeCard>
                <p className="font-semibold text-white text-lg mb-3">Consent Text (as shown on our form)</p>
                <p className="text-gray-300 leading-relaxed">
                  I agree to receive SMS from OutboundRevive about my account and follow-ups. Msg &amp; data rates may apply. Up to 4 msgs/mo. Reply{' '}
                  <code className="text-amber-400 bg-white/10 px-2 py-1 rounded">PAUSE</code> to pause reminders,{' '}
                  <code className="text-amber-400 bg-white/10 px-2 py-1 rounded">HELP</code> for help. Consent not a condition of purchase. See our{' '}
                  <a className="text-amber-400 hover:text-amber-300 transition-colors" href="/legal/privacy">Privacy Policy</a> and{' '}
                  <a className="text-amber-400 hover:text-amber-300 transition-colors" href="/legal/terms">Terms</a>.
                </p>
              </OrangeCard>

              <OrangeCard>
                <div className="space-y-4 text-lg text-gray-300">
                  <p>
                    <strong className="text-white">Message Frequency:</strong> Up to 4 messages per month.
                  </p>
                  <p>
                    <strong className="text-white">Fees:</strong> Message and data rates may apply.
                  </p>
                  <p>
                    <strong className="text-white">Opt-Out:</strong> Reply{' '}
                    <code className="text-amber-400 bg-white/10 px-2 py-1 rounded">PAUSE</code> to pause reminders at any time. Reply{' '}
                    <code className="text-amber-400 bg-white/10 px-2 py-1 rounded">RESUME</code> to continue.
                  </p>
                  <p>
                    <strong className="text-white">Help:</strong> Reply{' '}
                    <code className="text-amber-400 bg-white/10 px-2 py-1 rounded">HELP</code> for help or email{' '}
                    <a className="text-amber-400 hover:text-amber-300 transition-colors" href="mailto:support@outboundrevive.com">
                      support@outboundrevive.com
                    </a>.
                  </p>
                </div>
              </OrangeCard>

              <OrangeCard>
                <p className="font-semibold text-white text-lg mb-3">Sample Message</p>
                <p className="text-gray-300 leading-relaxed">
                  OutboundRevive: Hi &#123;first_name&#125;, this is Charlie following up about your recent service. Any questions or next steps I can help with? Reply{' '}
                  <code className="text-amber-400 bg-white/10 px-2 py-1 rounded">PAUSE</code> to pause reminders,{' '}
                  <code className="text-amber-400 bg-white/10 px-2 py-1 rounded">HELP</code> for help.
                </p>
              </OrangeCard>

              <OrangeCard>
                <p className="text-lg text-gray-300">
                  See our{' '}
                  <a className="text-amber-400 hover:text-amber-300 transition-colors" href="/legal/privacy">Privacy Policy</a> and{' '}
                  <a className="text-amber-400 hover:text-amber-300 transition-colors" href="/legal/terms">Terms &amp; Conditions</a>.
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
  'SMS Consent — OutboundRevive',
  'How we collect SMS consent, frequency, PAUSE/HELP, and sample messages.',
  '/sms-consent'
);
