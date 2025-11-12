import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import Nav from "@/app/(www)/components/Nav";
import Hero from "@/app/(www)/components/Hero";
import FeatureGrid from "@/app/(www)/components/FeatureGrid";
import HowItWorks from "@/app/(www)/components/HowItWorks";
import CTA from "@/app/(www)/components/CTA";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Nav />
      <main className="flex-1 relative bg-gradient-to-b from-indigo-900 via-indigo-800 to-slate-900 bg-grid">
        
        <Hero />
        <FeatureGrid />
        <HowItWorks />
        <CTA />
      </main>

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

export const generateMetadata = (): Metadata => 
  pageMeta(
    "OutboundRevive — Revive Dead Leads, Boost Revenue",
    "Dark indigo theme with amber actions. AI-powered SMS follow-ups that re-engage leads and book meetings.",
    "/"
  );

