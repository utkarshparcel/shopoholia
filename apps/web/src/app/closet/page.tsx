import type { Metadata } from 'next';
import { ClosetHeader } from '@/components/closet/ClosetHeader';
import { ClosetHero } from '@/components/closet/ClosetHero';
import { ClosetWeek } from '@/components/closet/ClosetWeek';
import { ClosetBackups } from '@/components/closet/ClosetBackups';
import { ClosetStylist } from '@/components/closet/ClosetStylist';
import { ClosetValue } from '@/components/closet/ClosetValue';
import { ClosetFeatures } from '@/components/closet/ClosetFeatures';
import { ClosetCTA } from '@/components/closet/ClosetCTA';
import { ClosetFooter } from '@/components/closet/ClosetFooter';
import { ClosetPager } from '@/components/closet/ClosetPager';
import { CLOSET_URL, SITE_URL } from '@/lib/site';

const TITLE = 'Worn Closet — For everything you already bought';
const DESCRIPTION =
  'The next chapter of Worn: catalog what you own, plan the week, track cost per wear, keep tabs on gift cards, warranties and refunds, and sell, swap or donate the pile.';

export const metadata: Metadata = {
  // Its own title, share card and search data, so /closet never reads as Worn Play.
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: '/closet' },
  openGraph: {
    type: 'website',
    url: CLOSET_URL,
    siteName: 'Worn Closet',
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
};

const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'Worn Closet',
  url: CLOSET_URL,
  description: DESCRIPTION,
  publisher: { '@type': 'Organization', name: 'Worn', url: SITE_URL },
};

export default function ClosetPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
      />
      <ClosetHeader />
      <main id="main-content" className="flex-1">
        <ClosetHero />
        <ClosetWeek />
        <ClosetBackups />
        <ClosetStylist />
        <ClosetValue />
        <ClosetFeatures />
        <ClosetCTA />
      </main>
      <ClosetFooter />
      <ClosetPager />
    </>
  );
}
