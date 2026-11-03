import { PageShell } from '@/components/PageShell';
import { ShareLanding } from '@/components/ShareLanding';
import { shareMetadata } from '@/lib/share-metadata';

/** A Worn Closet "should I return it?" poll (next.config.js rewrites /p/return/<code> here). */
export const metadata = shareMetadata('return');

export default function ReturnPollPage() {
  return (
    <PageShell current="closet">
      <ShareLanding kind="return" />
    </PageShell>
  );
}
