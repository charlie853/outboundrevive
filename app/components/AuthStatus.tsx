'use client';

import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';

export default function AuthStatus() {
  const { user, loading, signOut } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return (
      <div className="flex gap-4">
        <Link
          href="/auth/login"
          className="text-indigo-600 hover:text-indigo-500 font-medium"
        >
          Sign in
        </Link>
        <Link
          href="/auth/signup"
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md font-medium"
        >
          Sign up
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <span className="text-gray-700">Welcome, {user.email}</span>
      <button
        onClick={() => signOut()}
        className="text-gray-500 hover:text-gray-700 font-medium"
      >
        Sign out
      </button>
    </div>
  );
}