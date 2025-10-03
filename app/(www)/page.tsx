import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
import Nav from '@/app/(www)/components/Nav';
import Hero from '@/app/(www)/components/Hero';
import Logos from '@/app/(www)/components/Logos';
import FeatureGrid from '@/app/(www)/components/FeatureGrid';
import TestimonialCarousel from '@/app/(www)/components/TestimonialCarousel';
import CTA from '@/app/(www)/components/CTA';
import FAQ from '@/app/(www)/components/FAQ';

export default function HomePage() {
  return (
    <div className="bg-surface-bg">
      <Nav />
      <Hero />
      <Logos />
      <FeatureGrid />
      <TestimonialCarousel />
      <CTA idSuffix="mid" />
      <FAQ />
      <CTA idSuffix="bottom" />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "OutboundRevive",
            url: (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '') || undefined,
          }),
        }}
      />
    </div>
  );
}

export const generateMetadata = (): Metadata => pageMeta(
  'OutboundRevive — AI SMS follow-ups that book real appointments',
  'Revive cold leads with compliant, AI-assisted SMS. Quiet hours, opt-outs, and a read-only dashboard. Book more kept appointments without babysitting outreach.',
  '/'
);

