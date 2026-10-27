import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';

import { FEATURE_CLOSET } from '@/src/lib/features';
import { closetEntryHref } from '@/src/lib/firstDelight';
import { useClosetStore } from '@/src/stores/closet';
import { useSessionStore } from '@/src/stores/session';

/**
 * The entry route picks the landing screen, including the persisted Play/Closet surface.
 * It runs inside the root navigator, so its redirect never fires before the navigator mounts
 * (navigating from the root layout's mount effect replaced the root route and remounted it in a loop).
 */
export default function Index() {
  const accessToken = useSessionStore((s) => s.accessToken);
  const activeSurface = useSessionStore((s) => s.activeSurface);
  const [hydrated, setHydrated] = useState(() => useSessionStore.persist.hasHydrated());

  useEffect(() => {
    if (hydrated) return;
    const unsubscribe = useSessionStore.persist.onFinishHydration(() => setHydrated(true));
    if (useSessionStore.persist.hasHydrated()) setHydrated(true);
    return unsubscribe;
  }, [hydrated]);

  if (!accessToken) {
    return <Redirect href={'/(auth)/login' as never} />;
  }
  if (!hydrated) return null;
  if (FEATURE_CLOSET && activeSurface === 'closet') {
    const closet = useClosetStore.getState();
    return (
      <Redirect
        href={
          closetEntryHref({
            featureCloset: FEATURE_CLOSET,
            hasMoneyAccounts: Boolean(closet.demoAccount),
            hasAnyConsent: false,
            onboardingSkipped: closet.onboardingSkipped,
            onboardingCompleted: closet.onboardingCompleted,
          }) as never
        }
      />
    );
  }
  return <Redirect href="/(tabs)/feed" />;
}
