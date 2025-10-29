import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
import Nav from "@/app/(www)/components/Nav";
import PageShell from "@/app/(www)/components/PageShell";
import SectionHeader from "@/app/(www)/components/SectionHeader";
import OrangeCard from "@/app/(www)/components/OrangeCard";

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Nav />
      <main className="flex-1">
        <PageShell>
          <div className="container mx-auto max-w-4xl px-4 py-16 md:py-24">
            <SectionHeader
              title="About OutboundRevive"
              subtitle="Respectful, compliant SMS follow-ups that book more appointments."
            />
            <div className="grid gap-6 md:grid-cols-2">
              <OrangeCard>
                <p className="text-lg text-gray-300 leading-relaxed">
                  OutboundRevive helps practices turn cold leads into booked appointments using AI SMS follow-ups grounded by your knowledge.
                </p>
              </OrangeCard>
              <OrangeCard>
                <p className="text-lg text-gray-300 leading-relaxed">
                  Follow-up should be respectful, compliant, and effective—so you can focus on care, not chasing.
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
  'About — OutboundRevive',
  'Our mission: respectful, effective SMS follow-ups that book more appointments.',
  '/about'
);
