import type { NextConfig } from 'next';
import withPWA from 'next-pwa';
import path from 'path';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
    ],
  },
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@config': path.resolve(__dirname, 'config'),
      'sharp$': false,
      'onnxruntime-node$': false,
    };
    return config;
  },
  serverExternalPackages: ['sharp', 'onnxruntime-node'],
};

const withPwa = withPWA({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
});

export default withPwa(nextConfig);
