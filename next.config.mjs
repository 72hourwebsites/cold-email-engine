/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [];
  },
};

export default nextConfig;

import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
