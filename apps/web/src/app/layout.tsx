import type { Metadata, Viewport } from 'next';
import { DM_Sans, DM_Serif_Display, DM_Mono } from 'next/font/google';
import './globals.css';
import { SmoothScroll } from '@/components/providers/SmoothScroll';
import { ScrollProgress } from '@/components/ScrollProgress';
import { GrainOverlay } from '@/components/GrainOverlay';

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
  'Worn is the shopping app where nothing ships. Browse real pieces, try them on your AI avatar, haul them with coins, wait for the delivery and unbox photos of you wearing them. The buying high without the parcel, the bill or the pile of clothes you never wear.';

export const metadata: Metadata = {
  metadataBase: new URL('https://worn.app'),
  title: {
    default: 'Worn — Stop Shopping. Start Wearing.',
    template: '%s | Worn',
  },
  description: DESCRIPTION,
  keywords: [
    'shop with coins',
    'no cash shopping app',
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
    url: 'https://worn.app',
    siteName: 'Worn',
    title: 'Worn: the shopping app where nothing ships',
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Worn: the shopping app where nothing ships',
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'MobileApplication',
              name: 'Worn',
              description: DESCRIPTION,
              operatingSystem: 'iOS, Android',
              applicationCategory: 'LifestyleApplication',
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'USD',
                availability: 'https://schema.org/InStock',
              },
              publisher: {
                '@type': 'Organization',
                name: 'Worn',
                url: 'https://worn.app',
              },
            }),
          }}
        />
        <ScrollProgress />
        <GrainOverlay />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 z-50 btn-primary"
        >
          Skip to main content
        </a>
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  );
}