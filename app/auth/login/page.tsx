"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import Nav from "@/app/(www)/components/Nav";
import PageShell from "@/app/(www)/components/PageShell";
import SectionHeader from "@/app/(www)/components/SectionHeader";
import OrangeCard from "@/app/(www)/components/OrangeCard";

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, user, loading: authLoading } = useAuth();
  const router = useRouter();

  // Redirect to dashboard if user is authenticated
  useEffect(() => {
    if (!authLoading && user) {
      setLoading(false);
      router.push('/dashboard');
    }
  }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      // Don't redirect here - let the useEffect handle it when user state updates
      // The loading state will remain true until the user is authenticated
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Nav />
      <main className="flex-1">
        <PageShell>
          <div className="container mx-auto max-w-lg px-4 py-20 md:py-28 pb-32">
            <SectionHeader 
              title="Sign in to your account" 
              subtitle="Access your dashboard and manage your campaigns"
            />
            
            <OrangeCard>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                    Email address
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border border-white/15 rounded-lg px-4 py-3 bg-white/5 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="you@company.com"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                    Password
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full border border-white/15 rounded-lg px-4 py-3 bg-white/5 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="Enter your password"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full btn-amber btn-pill px-6 py-3 font-semibold hover-lift tap-active disabled:opacity-60"
                >
                  {loading ? 'Signing in...' : 'Sign in'}
                </button>
              </form>

              {error && (
                <div className="mt-5 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300">
                  {error}
                </div>
              )}

              <div className="mt-6 text-center">
                <p className="text-sm text-gray-300">
                  Don't have an account?{' '}
                  <a
                    href="/book"
                    className="font-medium text-amber-400 hover:text-amber-300 underline-offset-4 hover:underline"
                  >
                    Schedule a walkthrough
                  </a>
                </p>
              </div>
            </OrangeCard>
          </div>
        </PageShell>
      </main>
    </div>
  );
}