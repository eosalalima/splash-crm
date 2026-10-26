import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Browser tests run beside the developer's server with separate output/locks.
  distDir:
    process.env.SPLASH_BROWSER_TEST_BUILD === "1"
      ? ".next/browser-tests"
      : ".next",
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
