import { Redirect } from 'expo-router';

import { useSessionStore } from '@/src/stores/session';

export default function Index() {
  const accessToken = useSessionStore((s) => s.accessToken);
  if (!accessToken) {
    return <Redirect href={'/(auth)/login' as never} />;
  }
  return <Redirect href="/(tabs)/feed" />;
}
