"use client";
import { usePathname } from 'next/navigation';
import SiteHeader from '@/app/components/SiteHeader';

export default function HeaderSwitcher() {
  const pathname = usePathname();
  if (pathname === '/demo') return null;
  return <SiteHeader />;
}

