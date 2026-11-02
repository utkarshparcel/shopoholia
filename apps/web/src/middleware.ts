import { NextResponse, type NextRequest } from 'next/server';
import { CLOSET_URL, PLAY_URL, hostOf } from '@/lib/site';

const CLOSET_HOST = hostOf(CLOSET_URL);
const PLAY_HOST = hostOf(PLAY_URL);

// Generated routes without a file extension that both sites share.
const SHARED_ROUTES = ['/icon', '/apple-icon', '/opengraph-image'];

/**
 * One app, two sites. On the closet host, "/" is the Closet page and its robots.txt and sitemap are
 * Closet's own; any other page belongs to Play and is sent there. On the Play host, /closet moves
 * to the closet host so each page has one address. Other hosts (previews) serve both paths as they are.
 */
export function middleware(request: NextRequest) {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '';
  const { pathname, search } = request.nextUrl;

  if (host === CLOSET_HOST) {
    if (pathname === '/') return NextResponse.rewrite(new URL('/closet', request.url));
    if (pathname === '/robots.txt' || pathname === '/sitemap.xml') {
      return NextResponse.rewrite(new URL(`/closet${pathname}`, request.url));
    }
    if (pathname === '/closet' || pathname === '/closet/') {
      return NextResponse.redirect(`${CLOSET_URL}/${search}`, 308);
    }
    const isFile = pathname.includes('.') || pathname.startsWith('/closet/');
    const isShared = SHARED_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
    if (!isFile && !isShared) return NextResponse.redirect(`${PLAY_URL}${pathname}${search}`, 308);
    return NextResponse.next();
  }

  if (host === PLAY_HOST && (pathname === '/closet' || pathname === '/closet/')) {
    return NextResponse.redirect(`${CLOSET_URL}/${search}`, 308);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/).*)'],
};
