export const runtime = 'nodejs';
export const revalidate = 0;
export const dynamic = 'force-dynamic';

import DashboardClient from './DashboardClient';

export default function DashboardPage() {
  return <DashboardClient />;
}
