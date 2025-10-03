"use client";
import { useEffect, useState } from "react";

const QUOTES = [
  { q: "We re‑engaged old inquiries and booked time fast.", a: "VP Sales, Home Services" },
  { q: "The agent covers follow‑ups we never had time for.", a: "Owner, Med Spa" },
  { q: "Clear ROI within weeks—our team stays focused.", a: "COO, Real Estate" },
];

export default function TestimonialCarousel() {
  const [i, setI] = useState(0);

  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (m.matches) return;
    const id = setInterval(() => setI((p) => (p + 1) % QUOTES.length), 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="mx-auto max-w-7xl px-4 md:px-6 py-12">
      <div className="rounded-2xl border border-surface-line bg-surface-card shadow-soft p-6 md:p-8">
        <div className="relative min-h-[100px]">
          {QUOTES.map((t, idx) => (
            <figure
              key={idx}
              aria-hidden={i !== idx}
              className={`transition-opacity duration-500 ${i === idx ? 'opacity-100' : 'opacity-0 absolute inset-0'}`}
            >
              <blockquote className="text-lg text-ink-1">“{t.q}”</blockquote>
              <figcaption className="mt-2 text-sm text-ink-2">{t.a}</figcaption>
            </figure>
          ))}
        </div>
        <div className="mt-4 flex gap-2" role="tablist" aria-label="Testimonials">
          {QUOTES.map((_, idx) => (
            <button
              key={idx}
              aria-label={`Show testimonial ${idx + 1}`}
              aria-selected={i === idx}
              role="tab"
              onClick={() => setI(idx)}
              className={`h-2.5 w-2.5 rounded-full border ${i === idx ? 'bg-brand-600 border-brand-600' : 'bg-white border-surface-line'}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

