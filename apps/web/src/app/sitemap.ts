import type { MetadataRoute } from 'next';
import { CLOSET_URL, PRIVACY_PATH, SITE_URL, SUPPORT_PATH } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    // The same string as the home page's canonical (alternates: '/' resolves to SITE_URL with no
    // trailing slash) and its og:url, so search engines see one URL for it.
    { url: SITE_URL, changeFrequency: 'weekly', priority: 1 },
    { url: CLOSET_URL, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}${PRIVACY_PATH}`, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${SITE_URL}${SUPPORT_PATH}`, changeFrequency: 'monthly', priority: 0.3 },
  ];
}
