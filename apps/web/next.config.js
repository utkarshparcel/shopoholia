const path = require('node:path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The monorepo root: the site reads docs/legal at build time, and tracing starts here.
  outputFileTracingRoot: path.join(__dirname, '../..'),
  // Every page is prerendered, so the site ships as plain files (apps/web/out) served by
  // Cloudflare Workers static assets. Response headers live in public/_headers, and the links the
  // app shares (/r/<code>, /c/<code>, …) are mapped onto their static pages in public/_redirects.
  output: 'export',
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
