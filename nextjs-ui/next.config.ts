import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Run on port 17435 (configured in package.json scripts)
  reactStrictMode: true,
  // Allow serving from loopback only in production
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:17435", "127.0.0.1:17435"],
    },
  },
};

export default nextConfig;
