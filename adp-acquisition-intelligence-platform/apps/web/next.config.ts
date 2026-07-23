import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@adp/contracts', '@adp/platform', '@adp/reporting', '@adp/database'],
};

export default nextConfig;
