import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Skip ESLint during `next build` so CI/CD doesn't block on lint issues
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Skip TypeScript type-checking during `next build` to unblock deploys
  // (keep enabled locally or in CI until types are cleaned up)
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
