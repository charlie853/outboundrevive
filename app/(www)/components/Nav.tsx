"use client";
import Link from "next/link";

export default function Nav() {
  return (
    <header className="sticky top-0 z-30 border-b border-indigo-700/30 bg-indigo-900/95 backdrop-blur supports-[backdrop-filter]:bg-indigo-900/90">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 md:px-6 py-3">
        <Link href="/" className="font-semibold text-white" aria-label="OutboundRevive Home">
          OutboundRevive
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-sm text-gray-300">
          <Link href="/dashboard" className="hover:text-white transition-colors">Dashboard</Link>
          <Link href="/contact" className="hover:text-white transition-colors">Contact</Link>
          <Link href="/book" className="rounded-pill bg-amber-500 text-indigo-900 px-4 py-2 hover:bg-amber-400 font-medium transition-colors" aria-label="Get a demo">
            Get a demo
          </Link>
          <Link href="/auth/login" className="rounded-pill border border-gray-600 px-4 py-2 text-gray-300 hover:bg-white/10 hover:text-white transition-colors" aria-label="Sign in">
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}
