"use client";
import { useEffect } from "react";
import BookingEmbed from "@/app/components/BookingEmbed";

export default function Client({ calLink }: { calLink: string | null }) {
  useEffect(() => {
    try { window.dispatchEvent(new CustomEvent("analytics_event", { detail: { id: "calendar_loaded" } })); } catch {}
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-4 md:px-6 py-16">
      <header className="mb-8">
        <h1 className="text-4xl font-semibold leading-tight text-white">Pick a time that works for you.</h1>
        <p className="mt-3 text-gray-300">
          A 30-minute walkthrough of OutboundRevive and whether it fits your workflow.
        </p>
      </header>

      <section aria-label="Schedule a demo" className="grad-border-amber p-0 overflow-hidden" data-analytics-id="calendar_loaded">
        {calLink ? (
          <BookingEmbed calLink={calLink} height={1000} className="w-full" />
        ) : (
          <div className="text-gray-300 text-sm p-6">
            Set <code className="text-amber-400 bg-white/10 px-2 py-1 rounded">CAL_PUBLIC_URL</code> in your environment to your Cal.com booking link (e.g.,
            <code className="ml-1 text-amber-400 bg-white/10 px-2 py-1 rounded">https://cal.com/yourname/outboundrevive-demo</code>). Then redeploy.
          </div>
        )}
      </section>

      {calLink && (
        <div className="mt-3 text-center text-gray-300 text-sm">
          If the calendar doesn't load, open directly:
          <a className="ml-2 text-amber-400 hover:text-amber-300 underline" href={`https://cal.com/${calLink}`} target="_blank" rel="noreferrer">cal.com/{calLink}</a>
        </div>
      )}

      <section className="mt-10 grid gap-6 md:grid-cols-2">
        <div className="grad-border-amber p-6">
          <h2 className="text-xl font-semibold text-white">What you'll get</h2>
          <ul className="mt-3 list-disc pl-5 text-gray-300">
            <li>Quick needs assessment</li>
            <li>How follow-ups run (live example)</li>
            <li>Expected lift &amp; rollout plan</li>
            <li>Answers to your specific use case</li>
          </ul>
        </div>
        <div className="grad-border-amber p-6">
          <h2 className="text-xl font-semibold text-white">Who should attend</h2>
          <p className="mt-3 text-gray-300">
            Owner/GM or RevOps lead; optional: one rep who owns follow-up.
          </p>
          <p className="mt-4 text-sm text-gray-300">
            Prefer email? <a className="text-amber-400 hover:text-amber-300 underline" href="mailto:support@outboundrevive.com">support@outboundrevive.com</a>
          </p>
        </div>
      </section>

      <section className="mt-10">
        <div className="grad-border-amber p-6 text-center">
          <blockquote className="text-lg text-white">"Clear, calm walkthrough. We saw exactly how to fix follow-up."</blockquote>
          <div className="mt-2 text-sm text-gray-300">COO, Multi-location Services</div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-6 md:gap-10 opacity-80">
            {Array.from({ length: 5 }).map((_, i) => (
              <svg key={i} width="112" height="28" viewBox="0 0 112 28" className="text-white/20" aria-hidden>
                <rect width="112" height="28" rx="6" fill="currentColor" />
              </svg>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
