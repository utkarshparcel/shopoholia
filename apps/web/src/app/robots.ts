import type { MetadataRoute } from 'next';
import { PLAY_URL } from '@/lib/site';

// Worn Play's robots.txt; the closet host gets its own from app/closet/robots.txt.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${PLAY_URL}/sitemap.xml`,
  };
}
