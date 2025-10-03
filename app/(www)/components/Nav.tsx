"use client";
import Link from "next/link";

export default function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-surface-line/80 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 md:px-6 py-3">
        <Link href="/" className="font-semibold text-ink-1" aria-label="OutboundRevive Home">
          OutboundRevive
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-sm text-ink-2">
          <Link href="/features" className="hover:text-ink-1">Features</Link>
          <Link href="/pricing" className="hover:text-ink-1">Pricing</Link>
          <Link href="/dashboard" className="hover:text-ink-1">Dashboard</Link>
          <Link href="/contact" className="hover:text-ink-1">Contact</Link>
          <Link href="/book" className="rounded-pill bg-brand-600 text-white px-3 py-1.5 hover:bg-brand-700" aria-label="Get a demo">
            Get a demo
          </Link>
          <Link href="/auth/login" className="rounded-pill border border-surface-line px-3 py-1.5 text-ink-1 hover:bg-white" aria-label="Sign in">
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}
