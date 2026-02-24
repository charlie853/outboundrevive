'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Redirect /dashboard/email/unibox/[id] to /dashboard/email/unibox?thread=id
 * so deep links open in the new 3-column Unibox layout.
 */
export default function UniboxThreadRedirect() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  useEffect(() => {
    if (id) router.replace(`/dashboard/email/unibox?thread=${id}`, { scroll: false });
  }, [id, router]);

  return (
    <div className="mt-6 flex items-center justify-center p-8">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
    </div>
  );
}
