import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
import Nav from "@/app/(www)/components/Nav";
import PageShell from "@/app/(www)/components/PageShell";
import SectionHeader from "@/app/(www)/components/SectionHeader";
import OrangeCard from "@/app/(www)/components/OrangeCard";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Nav />
      <main className="flex-1">
        <PageShell>
          <div className="container mx-auto max-w-4xl px-4 py-16 md:py-24">
            <SectionHeader 
              title="Privacy Policy" 
              subtitle="Last updated: October 2, 2025"
            />
            
            <div className="space-y-6">
              <OrangeCard>
                <p className="text-lg text-gray-300 leading-relaxed">
                  This Privacy Policy explains how OutboundRevive ("we", "us") collects, uses, and protects
                  information when you interact with our website and messaging services.
                </p>
              </OrangeCard>

              <OrangeCard>
                <h2 className="text-2xl font-semibold text-white mb-4">Information We Collect</h2>
                <ul className="list-disc pl-6 space-y-2 text-lg text-gray-300">
                  <li>Contact details (name, email, phone number)</li>
                  <li>Message content you send to us</li>
                  <li>Technical data (timestamps, delivery status, IP/country as provided by carriers)</li>
                </ul>
              </OrangeCard>

              <OrangeCard>
                <h2 className="text-2xl font-semibold text-white mb-4">How We Use Information</h2>
                <ul className="list-disc pl-6 space-y-2 text-lg text-gray-300">
                  <li>Provide follow-ups, account and service updates</li>
                  <li>Respond to inquiries and provide support</li>
                  <li>Maintain security and prevent abuse</li>
                  <li>Comply with legal obligations</li>
                </ul>
              </OrangeCard>

              <OrangeCard>
                <h2 className="text-2xl font-semibold text-white mb-4">Sharing</h2>
                <p className="text-lg text-gray-300 leading-relaxed">
                  We use trusted service providers (e.g., messaging and hosting vendors) to deliver our services.
                  We do not sell your personal information.
                </p>
              </OrangeCard>

              <OrangeCard>
                <h2 className="text-2xl font-semibold text-white mb-4">Retention</h2>
                <p className="text-lg text-gray-300 leading-relaxed">
                  We retain messages and related metadata for as long as necessary to provide services and for
                  legitimate business purposes, then delete or anonymize them.
                </p>
              </OrangeCard>

              <OrangeCard>
                <h2 className="text-2xl font-semibold text-white mb-4">Your Choices</h2>
                <ul className="list-disc pl-6 space-y-2 text-lg text-gray-300">
                  <li>
                    SMS: Reply <code className="text-amber-400 bg-white/10 px-2 py-1 rounded">PAUSE</code> to pause reminders,{' '}
                    <code className="text-amber-400 bg-white/10 px-2 py-1 rounded">RESUME</code> to continue, and{' '}
                    <code className="text-amber-400 bg-white/10 px-2 py-1 rounded">HELP</code> for help.
                  </li>
                  <li>
                    Email us at{' '}
                    <a className="text-amber-400 hover:text-amber-300 transition-colors" href="mailto:support@outboundrevive.com">
                      support@outboundrevive.com
                    </a>{' '}
                    to request access, correction, or deletion.
                  </li>
                </ul>
              </OrangeCard>

              <OrangeCard>
                <h2 className="text-2xl font-semibold text-white mb-4">Security</h2>
                <p className="text-lg text-gray-300 leading-relaxed">
                  We use reasonable technical and organizational measures to protect information. No method of
                  transmission or storage is 100% secure.
                </p>
              </OrangeCard>

              <OrangeCard>
                <h2 className="text-2xl font-semibold text-white mb-4">Contact</h2>
                <p className="text-lg text-gray-300 leading-relaxed">
                  Questions? Email{' '}
                  <a className="text-amber-400 hover:text-amber-300 transition-colors" href="mailto:support@outboundrevive.com">
                    support@outboundrevive.com
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
  'Privacy Policy — OutboundRevive',
  'How OutboundRevive collects, uses, and protects your information.',
  '/privacy'
);
