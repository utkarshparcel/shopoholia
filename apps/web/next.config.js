/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Every page is prerendered, so the site ships as plain files (apps/web/out) served by
  // Cloudflare Workers static assets. Response headers live in public/_headers.
  output: 'export',
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
