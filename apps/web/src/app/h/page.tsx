import { PageShell } from '@/components/PageShell';
import { ShareLanding } from '@/components/ShareLanding';
import { shareMetadata } from '@/lib/share-metadata';

/** A Worn Closet household invite (public/_redirects maps /h/<code> here). */
export const metadata = shareMetadata('household');

export default function HouseholdInvitePage() {
  return (
    <PageShell current="closet">
      <ShareLanding kind="household" />
    </PageShell>
  );
}
