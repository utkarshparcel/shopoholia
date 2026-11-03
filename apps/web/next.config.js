const path = require('node:path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The monorepo root: the site reads docs/legal at build time, and tracing starts here.
  outputFileTracingRoot: path.join(__dirname, '../..'),
  // SEO: compress responses
  compress: true,
  // Links the app shares (src/lib/share-links.ts): each one lands on its static page, which reads
  // the code from the address in the browser. No server rendering, nothing looked up.
  async rewrites() {
    return [
      { source: '/r/:code', destination: '/r' },
      { source: '/c/:code', destination: '/c' },
      { source: '/h/:code', destination: '/h' },
      { source: '/p/outfit/:id', destination: '/p/outfit' },
      { source: '/p/return/:id', destination: '/p/return' },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
        ],
      },
      {
        source: '/:all*(svg|jpg|jpeg|png|webp|avif|ico)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
  // SEO: image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
};

module.exports = nextConfig;