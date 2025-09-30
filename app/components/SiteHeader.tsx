"use client";

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

export default function SiteHeader() {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-50 border-b border-surface-line bg-white/80 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 md:px-6 h-14 flex items-center justify-between">
        <Link href="/" className="font-semibold tracking-tight text-ink-1">
          OutboundRevive
        </Link>

        <nav className="flex items-center gap-4">
          <a href="#how-it-works" className="text-sm text-ink-2 hover:text-ink-1">How it works</a>
          <a href="#book" className="text-sm text-ink-2 hover:text-ink-1">Book a demo</a>
          {user ? (
            <Link href="/dashboard" className="px-3 py-1.5 rounded-pill bg-brand-600 hover:bg-brand-700 text-white text-sm shadow-soft transition">
              Dashboard
            </Link>
          ) : (
            <Link href="/auth/login" className="px-3 py-1.5 rounded-pill border border-surface-line bg-white/70 backdrop-blur text-sm hover:bg-white transition">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
