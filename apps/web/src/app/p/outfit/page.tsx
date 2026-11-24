import { PageShell } from '@/components/PageShell';
import { ShareLanding } from '@/components/ShareLanding';
import { shareMetadata } from '@/lib/share-metadata';

/** A Worn Closet "which look should I wear?" poll (public/_redirects maps /p/outfit/<code> here). */
export const metadata = shareMetadata('outfit');

export default function OutfitPollPage() {
  return (
    <PageShell current="closet">
      <ShareLanding kind="outfit" />
    </PageShell>
  );
}
