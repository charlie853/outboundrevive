'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function LogoutPage() {
  const { signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const handleLogout = async () => {
      await signOut();
      router.push('/auth/login');
    };

    handleLogout();
  }, [signOut, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Signing out...</h2>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto"></div>
      </div>
    </div>
  );
}