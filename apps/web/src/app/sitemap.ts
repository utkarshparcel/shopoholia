import type { MetadataRoute } from 'next';
import { CLOSET_URL, SITE_URL } from '@/lib/site';

// Static export (Next 15 wants this on every metadata route under output: 'export').
export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    // The same string as the home page's canonical (alternates: '/' resolves to SITE_URL with no
    // trailing slash) and its og:url, so search engines see one URL for it.
    { url: SITE_URL, changeFrequency: 'weekly', priority: 1 },
    { url: CLOSET_URL, changeFrequency: 'weekly', priority: 0.8 },
  ];
}
