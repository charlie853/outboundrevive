"use client";
import Image from "next/image";
import Link from "next/link";
import { Check } from "lucide-react";
import WaitlistMini from "./WaitlistMini";

export default function Hero() {
  const bullets = [
    "Hands-free SMS follow-ups",
    "Booking nudges that actually convert",
    "Compliance built-in (PAUSE/RESUME/HELP)",
  ];

  return (
    <section className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-4 md:px-6 py-16 md:grid-cols-2 md:items-center">
      <div>
        <h1 className="text-4xl md:text-5xl font-semibold leading-tight text-ink-1">
          Turn more leads into conversations—automatically.
        </h1>
        <p className="mt-4 text-lg text-ink-2">
          OutboundRevive follows up by SMS so you don’t have to. Booked meetings, kept appointments, fewer no-shows.
        </p>
        <ul className="mt-6 space-y-2 text-ink-2">
          {bullets.map((t) => (
            <li key={t} className="flex items-start gap-2">
              <Check className="mt-1 h-5 w-5 text-brand-600" aria-hidden />
              <span>{t}</span>
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/book"
            className="rounded-pill bg-brand-600 px-5 py-3 text-white hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            data-analytics-id="cta-demo-top"
            aria-label="Get a demo"
          >
            Get a demo
          </Link>
          <a href="#how-it-works" className="px-5 py-3 underline text-ink-1" aria-label="See how it works">
            See how it works
          </a>
        </div>
        <WaitlistMini />
      </div>

      <div className="relative h-64 w-full md:h-80">
        <div className="absolute inset-0 rounded-2xl border border-surface-line bg-white shadow-soft" aria-hidden />
        <Image
          src="/brand/hero-grid.svg"
          alt="OutboundRevive dashboard preview"
          fill
          sizes="(min-width: 768px) 560px, 100vw"
          className="rounded-2xl object-cover"
          priority
        />
      </div>
    </section>
  );
}
