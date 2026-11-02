import type { MetadataRoute } from 'next';
import { PLAY_URL } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${PLAY_URL}/`, changeFrequency: 'weekly', priority: 1 }];
}
