import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@adp/contracts', '@adp/platform'],
};

export default nextConfig;
