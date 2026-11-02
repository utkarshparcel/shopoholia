import { CLOSET_URL } from '@/lib/site';

// Served as closet.worncloset.app/robots.txt (src/middleware.ts maps it here).
export const dynamic = 'force-static';

export function GET() {
  return new Response(`User-Agent: *\nAllow: /\n\nSitemap: ${CLOSET_URL}/sitemap.xml\n`, {
    headers: { 'Content-Type': 'text/plain' },
  });
}
