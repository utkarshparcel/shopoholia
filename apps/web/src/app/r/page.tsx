import { PageShell } from '@/components/PageShell';
import { ShareLanding } from '@/components/ShareLanding';
import { shareMetadata } from '@/lib/share-metadata';

/** A referral link from the app's Refer & earn screen (public/_redirects maps /r/<code> here). */
export const metadata = shareMetadata('referral');

export default function ReferralPage() {
  return (
    <PageShell current="play">
      <ShareLanding kind="referral" />
    </PageShell>
  );
}
