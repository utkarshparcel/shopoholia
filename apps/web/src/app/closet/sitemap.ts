import type { MetadataRoute } from 'next';
import { CLOSET_URL } from '@/lib/site';

// Served as closet.worncloset.app/sitemap.xml (src/middleware.ts maps it here).
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${CLOSET_URL}/`, changeFrequency: 'weekly', priority: 1 }];
}
