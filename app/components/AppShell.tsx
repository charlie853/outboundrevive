"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SidebarCRMCard from '@/app/(app)/dashboard/components/SidebarCRMCard';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const NavLink = ({ href, label }: { href: string; label: string }) => {
    const isActive = pathname === href;
    return (
      <Link
        href={href}
        className={`relative block px-4 py-3 text-sm font-medium rounded-lg transition-all ${
          isActive
            ? 'text-white bg-white/10'
            : 'text-white/70 hover:text-white hover:bg-white/5'
        }`}
      >
        {isActive && (
          <div className="absolute left-0 top-0 bottom-0 w-1 rounded-r bg-warning" />
        )}
        {label}
      </Link>
    );
  };

  return (
    <div className="flex min-h-screen bg-surface-bg">
      {/* Fixed Sidebar with brand gradient */}
      <aside className="w-64 flex flex-col fixed h-screen">
        {/* Top section with gradient - ends at slate-900 before buffer strip */}
        <div 
          className="flex-1 flex flex-col p-6 overflow-y-auto"
          style={{ background: 'linear-gradient(to bottom, #4338CA 0%, #3730A3 50%, #0F172A 90%, #0F172A 100%)' }}
        >
          <Link href="/dashboard" className="mb-8 flex-shrink-0">
            <h1 className="text-xl font-bold text-white">OutboundRevive</h1>
          </Link>
          <nav className="flex-1 space-y-2">
            <NavLink href="/dashboard" label="Overview" />
            <NavLink href="/dashboard/messaging" label="Messaging" />
            <NavLink href="/dashboard/appointments" label="Appointments" />
            <NavLink href="/dashboard/reengagement" label="Re-engagement" />
            <NavLink href="/dashboard/funnel" label="Funnel & Metrics" />
            <NavLink href="/dashboard/usage" label="Usage & Billing" />
          </nav>
          <div className="mt-auto mb-20">
            <SidebarCRMCard />
          </div>
        </div>
        {/* Buffer strip that matches footer height and color exactly - footer has py-3 (12px top + 12px bottom = 24px) + text-xs line-height (~16px) = ~40px total */}
        <div className="w-full bg-slate-900" style={{ height: '40px' }} />
      </aside>
      
      {/* Main content area - scrollable */}
      <main className="flex-1 overflow-y-auto ml-64 pb-20">
        <div className="max-w-6xl mx-auto px-8 py-8">
          {children}
        </div>
      </main>
      
      {/* Fixed Footer - spans full width, connected to sidebar */}
      <footer className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-white/10 z-10">
        <div className="max-w-6xl mx-auto px-6 py-3 text-xs text-white/50 flex items-center gap-4">
          <a className="hover:text-white transition-colors" href="/">Home</a>
          <a className="hover:text-white transition-colors" href="/about">About</a>
          <a className="hover:text-white transition-colors" href="/messaging-policy">SMS Consent</a>
          <a className="hover:text-white transition-colors" href="/legal/privacy">Privacy Policy</a>
          <a className="hover:text-white transition-colors" href="/legal/terms">Terms &amp; Conditions</a>
          <a className="hover:text-white transition-colors" href="/contact">Contact</a>
          <a className="hover:text-white transition-colors" href="mailto:support@outboundrevive.com">support@outboundrevive.com</a>
          <span className="ml-auto">© {new Date().getFullYear()} OutboundRevive</span>
        </div>
      </footer>
    </div>
  );
}
