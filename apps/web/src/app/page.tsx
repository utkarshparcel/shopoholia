import type { Metadata } from 'next';
import { Hero } from '@/components/Hero';
import { DropStage } from '@/components/DropStage';
import { DopamineLoop } from '@/components/DopamineLoop';
import { GhostWardrobe } from '@/components/GhostWardrobe';
import { TwoSides } from '@/components/TwoSides';
import { Features } from '@/components/Features';
import { HowItWorks } from '@/components/HowItWorks';
import { DownloadCTA } from '@/components/DownloadCTA';
import { Footer } from '@/components/Footer';
import { Navigation } from '@/components/Navigation';

const DESCRIPTION =
  'Worn is the shopping app where nothing ships. Browse real pieces, try them on your AI avatar, haul them with coins, wait for the delivery and unbox AI renders of you wearing them. The buying high without the parcel, the bill or the pile of clothes you never wear.';

export const metadata: Metadata = {
  title: { absolute: 'Worn — Stop Shopping. Start Wearing.' },
  description: DESCRIPTION,
  openGraph: {
    title: 'Worn: the shopping app where nothing ships',
    description: DESCRIPTION,
  },
};

export default function HomePage() {
  return (
    <>
      <Navigation />
      <main id="main-content" className="flex-1">
        <Hero />
        <DropStage />
        <DopamineLoop />
        <GhostWardrobe />
        <TwoSides />
        <Features />
        <HowItWorks />
        <DownloadCTA />
      </main>
      <Footer />
    </>
  );
}
