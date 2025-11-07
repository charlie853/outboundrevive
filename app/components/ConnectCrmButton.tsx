'use client';

import { useAuth } from '@/lib/auth-context';
import CRMIntegrations from '@/app/components/CRMIntegrations';

export default function ConnectCrmButton({ onConnect }: { onConnect?: () => void }) {
  const { user } = useAuth();

  const handleConnect = () => {
    // Notify parent component that CRM was connected
    onConnect?.();
  };

  return (
    <CRMIntegrations
      variant="button"
      userId={user?.id ?? 'unknown-user'}
      userEmail={user?.email ?? undefined}
      organizationId="dashboard"
      onConnect={handleConnect}
    />
  );
}
