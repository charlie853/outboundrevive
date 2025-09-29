'use client';

import { useAuth } from '@/lib/auth-context';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  publicRoutes?: string[]; // Routes that don't require authentication
}

export default function ProtectedRoute({ children, fallback, publicRoutes = ['/'] }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Check if current route is public
  const isPublicRoute = publicRoutes.some(route =>
    pathname === route || pathname.startsWith('/auth/')
  );

  useEffect(() => {
    if (!loading && !user && !isPublicRoute) {
      router.push('/auth/login');
    }
  }, [user, loading, router, isPublicRoute]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto"></div>
          <p className="text-gray-600 mt-2">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user && !isPublicRoute) {
    return fallback || null;
  }

  return <>{children}</>;
}