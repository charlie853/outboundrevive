'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import TopBar from '@/app/(app)/dashboard/components/TopBar';

export default function EmailLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const nav = [
    { href: '/dashboard/email/campaigns', label: 'Campaigns' },
    { href: '/dashboard/email/leads', label: 'Leads' },
    { href: '/dashboard/email/unibox', label: 'Unibox' },
    { href: '/dashboard/email/domains', label: 'Domains' },
    { href: '/dashboard/email/stats', label: 'Stats' },
  ];
  return (
    <div>
      <TopBar
        title="Email"
        subtitle="Cold email campaigns, Unibox, and deliverability."
      />
      <nav className="mt-4 mb-6 flex flex-wrap gap-2 border-b border-surface-border pb-4">
        {nav.map(({ href, label }) => {
          const isActive = pathname === href || (href !== '/dashboard/email' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                isActive ? 'bg-warning/10 text-warning' : 'text-ink-2 hover:bg-surface-card hover:text-ink-1'
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
