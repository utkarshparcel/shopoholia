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

export const metadata: Metadata = {
  title: {
    absolute: 'Worn Closet — For everything you already bought',
  },
  description:
    'The next chapter of Worn: catalog what you own, plan the week, track cost per wear, keep tabs on gift cards, warranties and refunds, and sell, swap or donate the pile.',
  openGraph: {
    title: 'Worn Closet — For everything you already bought',
    description:
      'The next chapter of Worn: catalog what you own, plan the week, track cost per wear, keep tabs on gift cards, warranties and refunds, and sell, swap or donate the pile.',
  },
};

export default function ClosetPage() {
  return (
    <>
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
