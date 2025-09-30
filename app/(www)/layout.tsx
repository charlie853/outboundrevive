import type { Metadata } from 'next';
import '../globals.css';
import SiteHeader from '@/app/components/SiteHeader';
import SiteFooter from '@/app/components/SiteFooter';
import { headers } from 'next/headers';
import CookieConsent from '@/app/components/CookieConsent';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PUBLIC_BASE_URL ?? 'http://localhost:3001'),
  title: {
    default: 'OutboundRevive — AI SMS follow-ups that book real appointments',
    template: '%s | OutboundRevive',
  },
  description:
    'Revive cold leads with compliant, AI-assisted SMS. Quiet hours, opt-outs, and a read-only dashboard. Book more kept appointments without babysitting outreach.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'OutboundRevive — AI SMS follow-ups that book real appointments',
    description:
      'Revive cold leads with compliant, AI-assisted SMS. Quiet hours, opt-outs, and a read-only dashboard. Book more kept appointments without babysitting outreach.',
    type: 'website',
    images: ['/og']
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OutboundRevive — AI SMS follow-ups that book real appointments',
    description:
      'Revive cold leads with compliant, AI-assisted SMS. Quiet hours, opt-outs, and a read-only dashboard. Book more kept appointments without babysitting outreach.',
    images: ['/og']
  }
};

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const h = headers();
  const base = (process.env.PUBLIC_BASE_URL || `https://${h.get('host') || 'localhost:3000'}`).replace(/\/$/, '');
  const canonical = `${base}/`;
  return (
    <html lang="en">
      <head>
        <link rel="canonical" href={canonical} />
        <script type="application/ld+json" suppressHydrationWarning>
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'OutboundRevive',
            url: base,
            sameAs: ['https://x.com', 'https://www.linkedin.com'],
          })}
        </script>
        <script type="application/ld+json" suppressHydrationWarning>
          {JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebSite', name: 'OutboundRevive', url: base })}
        </script>
      </head>
      <body className="bg-grid">
        <SiteHeader />
        <main className="min-h-dvh">{children}</main>
        <SiteFooter />
        <CookieConsent />
      </body>
    </html>
  );
}
