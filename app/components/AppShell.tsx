"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const NavLink = ({ href, label }: { href: string; label: string }) => (
    <Link
      href={href}
      className={
        `px-3 py-1.5 text-sm rounded-full border border-border ` +
        (pathname === href
          ? 'bg-elev2 text-white'
          : 'bg-elev1 text-muted hover:bg-elev2 hover:text-text')
      }
    >
      {label}
    </Link>
  );

  return (
    <div className="min-h-dvh bg-bg bg-radial-soft text-text">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-panel/80 backdrop-blur supports-[backdrop-filter]:bg-panel/60">
        <div className="mx-auto max-w-7xl px-4 md:px-6 h-14 flex items-center justify-between">
          <Link href="/dashboard" className="font-semibold tracking-tight">OutboundRevive</Link>
          <nav className="flex items-center gap-2">
            <NavLink href="/dashboard" label="Dashboard" />
            <NavLink href="/activity" label="Activity" />
            <NavLink href="/leads" label="Leads" />
            <NavLink href="/metrics" label="Metrics" />
            <NavLink href="/settings" label="Settings" />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 md:px-6 py-6">
        {children}
      </main>
    </div>
  );
}
