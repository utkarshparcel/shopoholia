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
import { FAQ, FAQS } from '@/components/FAQ';
import { SITE_URL } from '@/lib/site';

const TITLE = 'Worn Play — the fashion haul without the bill';
const DESCRIPTION =
  'Worn Play is a free fashion shopping app where you pay with coins, not money. Try real pieces on your own AI avatar, check out, track the delivery and unbox photos of you wearing them. All the fun of a haul, none of the bill or the pile.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'Worn',
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
};

const STRUCTURED_DATA = [
  {
    '@context': 'https://schema.org',
    '@type': 'MobileApplication',
    name: 'Worn',
    description: DESCRIPTION,
    operatingSystem: 'iOS, Android',
    applicationCategory: 'LifestyleApplication',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    publisher: { '@type': 'Organization', name: 'Worn', url: SITE_URL },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  },
];

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
      />
      <Navigation />
      <main id="main-content" className="flex-1">
        {/* What it is, the problem, how it works; then the proof, the money, the doubts, the ask. */}
        <Hero />
        <GhostWardrobe />
        <DopamineLoop />
        <DropStage />
        <Features />
        <HowItWorks />
        <FAQ />
        <DownloadCTA />
        <TwoSides />
      </main>
      <Footer />
    </>
  );
}
