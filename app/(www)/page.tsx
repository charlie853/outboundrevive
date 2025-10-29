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
      <main className="flex-1 relative bg-gradient-to-b from-indigo-900 via-indigo-800 to-slate-900">
        {/* Simple static orbs for visual interest */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-40">
          <div className="absolute top-20 right-10 w-96 h-96 bg-gradient-to-br from-indigo-500/30 to-purple-500/30 rounded-full blur-3xl" />
          <div className="absolute top-1/3 left-20 w-80 h-80 bg-gradient-to-br from-amber-400/20 to-orange-400/20 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/3 w-72 h-72 bg-gradient-to-br from-purple-500/25 to-indigo-500/25 rounded-full blur-3xl" />
          <div className="absolute bottom-40 left-10 w-64 h-64 bg-gradient-to-br from-amber-400/15 to-yellow-400/15 rounded-full blur-3xl" />
        </div>
        
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

