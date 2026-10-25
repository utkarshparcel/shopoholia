import type { Metadata } from 'next';
import { ClosetHeader } from '@/components/closet/ClosetHeader';
import { ClosetHero } from '@/components/closet/ClosetHero';
import { ClosetFeatures } from '@/components/closet/ClosetFeatures';
import { ClosetFooter } from '@/components/closet/ClosetFooter';

export const metadata: Metadata = {
  title: {
    absolute: 'Worn Closet — For everything you already bought',
  },
  description:
    'The next chapter of Worn: catalog what you own, plan the week, track cost per wear, rescue gift cards, warranties and refunds, and sell, swap or donate the pile.',
  openGraph: {
    title: 'Worn Closet — For everything you already bought',
    description:
      'The next chapter of Worn: catalog what you own, plan the week, track cost per wear, rescue gift cards, warranties and refunds, and sell, swap or donate the pile.',
  },
};

export default function ClosetPage() {
  return (
    <>
      <ClosetHeader />
      <main id="main-content" className="flex-1">
        <ClosetHero />
        <ClosetFeatures />
      </main>
      <ClosetFooter />
    </>
  );
}
