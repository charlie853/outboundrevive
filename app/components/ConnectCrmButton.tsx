'use client';

import { useAuth } from '@/lib/auth-context';
import CRMIntegrations from '@/app/components/CRMIntegrations';

export default function ConnectCrmButton() {
  const { user } = useAuth();

  return (
    <CRMIntegrations
      variant="button"
      userId={user?.id ?? 'unknown-user'}
      userEmail={user?.email ?? undefined}
      organizationId="dashboard"
    />
  );
}
