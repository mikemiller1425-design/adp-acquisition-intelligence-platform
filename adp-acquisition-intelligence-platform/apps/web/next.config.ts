import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ['127.0.0.1'],
  transpilePackages: [
    '@adp/contracts',
    '@adp/platform',
    '@adp/reporting',
    '@adp/database',
    '@adp/research',
    '@adp/collection',
  ],
  serverExternalPackages: ['tldts'],
};

export default nextConfig;
