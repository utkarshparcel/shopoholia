import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { SmoothScroll } from '@/components/providers/SmoothScroll';
import { MotionProvider } from '@/components/providers/MotionProvider';
import { ScrollProgress } from '@/components/ScrollProgress';
import { GrainOverlay } from '@/components/GrainOverlay';
import { SITE_URL } from '@/lib/site';

/*
 * The fonts ship with the site (src/app/_fonts: the Latin subsets of DM Sans, DM Serif Display and
 * DM Mono from Fontsource 5.3.0, SIL Open Font License), so a build never waits on Google Fonts: a
 * bad answer from it once failed CI, and the deploy runs the same build.
 */
const dmSans = localFont({
  src: [
    { path: './_fonts/dm-sans-latin-300-normal.woff2', weight: '300', style: 'normal' },
    { path: './_fonts/dm-sans-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './_fonts/dm-sans-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './_fonts/dm-sans-latin-600-normal.woff2', weight: '600', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-sans',
});

const dmSerifDisplay = localFont({
  src: [
    { path: './_fonts/dm-serif-display-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './_fonts/dm-serif-display-latin-400-italic.woff2', weight: '400', style: 'italic' },
  ],
  display: 'swap',
  variable: '--font-display',
  adjustFontFallback: 'Times New Roman',
});

const dmMono = localFont({
  src: [
    { path: './_fonts/dm-mono-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './_fonts/dm-mono-latin-500-normal.woff2', weight: '500', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-mono',
  adjustFontFallback: false,
});

const DESCRIPTION =
  'A nicotine patch for shopaholics. Skip the ₹2,000 dress you wear once for a café photo: try real pieces on your AI avatar, pay with free coins, and unbox photos of you wearing them.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Worn Play — a nicotine patch for shopaholics',
    template: '%s | Worn',
  },
  description: DESCRIPTION,
  keywords: [
    'shop with coins',
    'coin shopping app',
    'AI try on',
    'virtual try-on app',
    'virtual shopping',
    'dopamine shopping',
    'shopaholic',
    'impulse shopping',
  ],
  authors: [{ name: 'Worn Team' }],
  creator: 'Worn',
  publisher: 'Worn',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    siteName: 'Worn',
    title: 'Worn Play — a nicotine patch for shopaholics',
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Worn Play — a nicotine patch for shopaholics',
    description: DESCRIPTION,
  },
  // icon.svg, apple-icon.tsx and opengraph-image.tsx in this folder supply the icons and the share image
  manifest: '/site.webmanifest',
  category: 'Lifestyle',
};

/* Marks an <img> that failed with data-img-failed, and clears it if a new src loads later. */
const IMAGE_FALLBACK = `(function(){function f(e){var t=e.target;if(t&&t.tagName==='IMG'){if(e.type==='error')t.setAttribute('data-img-failed','');else t.removeAttribute('data-img-failed');}}document.addEventListener('error',f,true);document.addEventListener('load',f,true);})();`;

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf8f5' },
    { media: '(prefers-color-scheme: dark)', color: '#0f0e0c' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${dmSans.variable} ${dmSerifDisplay.variable} ${dmMono.variable}`}>
      <head>
        {/* fonts are self-hosted by next/font; the only third-party origin is the catalog's image CDN */}
        <link rel="preconnect" href="https://assets.newme.asia" />
        {/* Before any image loads: one that fails (the catalog CDN down or refusing us) hides instead of
            showing the browser's broken-image icon over its card's placeholder (globals.css). */}
        <script dangerouslySetInnerHTML={{ __html: IMAGE_FALLBACK }} />
      </head>
      <body className="min-h-screen flex flex-col">
        <ScrollProgress />
        <GrainOverlay />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:px-5 focus:py-3 z-[60] btn-primary"
        >
          Skip to main content
        </a>
        <MotionProvider>
          <SmoothScroll>{children}</SmoothScroll>
        </MotionProvider>
      </body>
    </html>
  );
}