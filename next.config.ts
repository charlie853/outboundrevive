import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Skip ESLint during `next build` so CI/CD doesn't block on lint issues
  eslint: {
    ignoreDuringBuilds: true,
  },
  // If you also want to ignore TS errors during builds, uncomment below
  // typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
