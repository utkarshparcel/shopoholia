import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// Static export (Next 15 wants this on every metadata route under output: 'export').
export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
