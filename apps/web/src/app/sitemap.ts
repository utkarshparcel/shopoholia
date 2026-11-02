import type { MetadataRoute } from 'next';
import { CLOSET_URL, SITE_URL } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: 'weekly', priority: 1 },
    { url: CLOSET_URL, changeFrequency: 'weekly', priority: 0.8 },
  ];
}
