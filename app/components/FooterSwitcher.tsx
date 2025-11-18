"use client";
import { usePathname } from 'next/navigation';
import SiteFooter from '@/app/components/SiteFooter';

export default function FooterSwitcher() {
  const pathname = usePathname();
  // Don't show SiteFooter on dashboard pages (they have their own footer in AppShell)
  if (pathname?.startsWith('/dashboard')) return null;
  return <SiteFooter />;
}

