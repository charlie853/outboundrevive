import ProtectedRoute from '@/app/components/ProtectedRoute';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PUBLIC_BASE_URL ?? 'http://localhost:3001'),
  title: { default: 'OutboundRevive', template: '%s | OutboundRevive' },
  description: 'Client Dashboard — read-only KPIs, activity, and Emergency Stop.',
  alternates: { canonical: '/dashboard' },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}
