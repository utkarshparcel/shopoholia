import { PageShell } from '@/components/PageShell';
import { ShareLanding } from '@/components/ShareLanding';
import { shareMetadata } from '@/lib/share-metadata';

/** A Worn Closet swap-circle invite (next.config.js rewrites /c/<code> here). */
export const metadata = shareMetadata('swap');

export default function SwapInvitePage() {
  return (
    <PageShell current="closet">
      <ShareLanding kind="swap" />
    </PageShell>
  );
}
