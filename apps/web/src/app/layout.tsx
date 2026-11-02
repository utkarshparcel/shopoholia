import type { Metadata, Viewport } from 'next';
import { DM_Sans, DM_Serif_Display, DM_Mono } from 'next/font/google';
import './globals.css';
import { SmoothScroll } from '@/components/providers/SmoothScroll';
import { MotionProvider } from '@/components/providers/MotionProvider';
import { ScrollProgress } from '@/components/ScrollProgress';
import { GrainOverlay } from '@/components/GrainOverlay';
import { SITE_URL } from '@/lib/site';

const dmSans = DM_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
  weight: ['300', '400', '500', '600'],
});

const dmSerifDisplay = DM_Serif_Display({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
  weight: ['400'],
  style: ['normal', 'italic'],
});

const dmMono = DM_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
  weight: ['400', '500'],
});

const DESCRIPTION =
  'Worn Play is a free fashion shopping app where you pay with coins, not money. Try real pieces on your own AI avatar, check out, track the delivery and unbox photos of you wearing them. All the fun of a haul, none of the bill or the pile.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Worn Play — the fashion haul without the bill',
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
    title: 'Worn Play — the fashion haul without the bill',
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Worn Play — the fashion haul without the bill',
    description: DESCRIPTION,
  },
  // icon.svg, apple-icon.tsx and opengraph-image.tsx in this folder supply the icons and the share image
  manifest: '/site.webmanifest',
  category: 'Lifestyle',
};

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