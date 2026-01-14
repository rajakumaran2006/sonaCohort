import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
  },
  turbopack: {
    root: process.cwd(),
  },
  async redirects() {
    return [
      {
        source: '/peer-tutor/dashboard',
        destination: '/peer/dashboard',
        permanent: true,
      },
    ]
  },
};

export default nextConfig;
