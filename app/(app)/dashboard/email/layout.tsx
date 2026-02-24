'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Mail } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import TopBar from '@/app/(app)/dashboard/components/TopBar';

export default function EmailLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [demoSeeding, setDemoSeeding] = useState(false);
  const [demoSeeded, setDemoSeeded] = useState(false);
  const nav = [
    { href: '/dashboard/email/campaigns', label: 'Campaigns' },
    { href: '/dashboard/email/leads', label: 'Leads' },
    { href: '/dashboard/email/unibox', label: 'Unibox' },
    { href: '/dashboard/email/domains', label: 'Domains' },
    { href: '/dashboard/email/stats', label: 'Stats' },
  ];

  const handleLoadDemoEmail = async () => {
    setDemoSeeding(true);
    setDemoSeeded(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const r = await fetch('/api/internal/demo/seed-email', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) {
        setDemoSeeded(true);
        setTimeout(() => setDemoSeeded(false), 5000);
      }
    } finally {
      setDemoSeeding(false);
    }
  };

  return (
    <div>
      <TopBar
        title="Email"
        subtitle="Cold email campaigns, Unibox, and deliverability."
        rightContent={
          <button
            type="button"
            onClick={handleLoadDemoEmail}
            disabled={demoSeeding}
            className="inline-flex items-center gap-2 rounded-lg border border-surface-border bg-surface-bg px-4 py-2 text-sm font-medium text-ink-1 hover:bg-surface-card transition disabled:opacity-50"
          >
            <Mail className="w-4 h-4" />
            {demoSeeding ? 'Loading…' : demoSeeded ? 'Demo loaded' : 'Load demo email'}
          </button>
        }
      />
      <nav className="mt-4 mb-6 flex flex-wrap gap-2 border-b border-surface-border pb-4">
        {nav.map(({ href, label }) => {
          const isActive = pathname === href || (href !== '/dashboard/email' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                isActive ? 'bg-brand-100 text-brand-700 border border-brand-200' : 'text-ink-2 hover:bg-surface-bg hover:text-ink-1'
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
