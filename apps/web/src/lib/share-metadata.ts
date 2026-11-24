import type { Metadata } from 'next';
import { SHARE_KINDS, type ShareKind } from './share-links';

/**
 * Metadata for a share-link landing: its own title and share card, kept out of search results
 * (each link is one person's invite) but still followed, and not blocked in robots.txt so chat
 * apps can fetch the preview.
 */
export function shareMetadata(kind: ShareKind): Metadata {
  const { title, description } = SHARE_KINDS[kind];
  return {
    // "You’re invited to Worn" needs no "| Worn"; the Closet links say whose invite it is
    title: { absolute: kind === 'referral' ? title : `${title} | Worn Closet` },
    description,
    robots: { index: false, follow: true, googleBot: { index: false, follow: true } },
    openGraph: { type: 'website', siteName: kind === 'referral' ? 'Worn' : 'Worn Closet', title, description },
    twitter: { card: 'summary_large_image', title, description },
  };
}
