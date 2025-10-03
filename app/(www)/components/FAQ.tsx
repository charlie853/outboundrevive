"use client";
import { useState } from "react";

const QA = [
  { q: "How does consent and opt-out work?", a: "Every message supports STOP/HELP. STOP immediately opts the contact out and we log consent changes." },
  { q: "Can I bring my own number?", a: "Yes. We can use your existing A2P/Toll-Free setup or provision a compliant number." },
  { q: "What CRMs do you support?", a: "CSV import works everywhere; common CRMs connect via Nango-based connectors." },
  { q: "What’s the typical time-to-value?", a: "Most teams see replies within days and booked meetings within the first week." },
  { q: "How do you handle STOP/HELP?", a: "Inbound STOP revokes messaging; HELP returns assistance info without altering consent." },
  { q: "Is there a free trial?", a: "Book a demo and we’ll align a short pilot depending on your volumes." },
];

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section className="mx-auto max-w-7xl px-4 md:px-6 py-16">
      <h2 className="text-3xl font-semibold text-ink-1">FAQ</h2>
      <div className="mt-6 grid md:grid-cols-2 gap-4">
        {QA.map((item, idx) => (
          <details
            key={idx}
            open={open === idx}
            onClick={(e) => {
              e.preventDefault();
              setOpen((p) => (p === idx ? null : idx));
            }}
            className="rounded-2xl border border-surface-line bg-surface-card p-4 shadow-soft"
          >
            <summary className="cursor-pointer font-semibold text-ink-1 list-none flex items-center justify-between">
              {item.q}
              <span className="ml-2 text-ink-2">{open === idx ? "–" : "+"}</span>
            </summary>
            <div className="text-sm text-ink-2 mt-2">{item.a}</div>
          </details>
        ))}
      </div>
    </section>
  );
}

