/** The router calls `goBack` needs (expo-router's `useRouter()` result). */
type BackRouter = {
  canGoBack: () => boolean;
  back: () => void;
  replace: (href: never) => void;
};

/**
 * "← Back" that always goes somewhere. A screen opened straight from a link (a push, a shared
 * URL, a cold start) has nothing behind it, and `router.back()` then does nothing: the user was
 * stuck. With no history it lands on `fallback` (the feed) instead.
 */
export function goBack(router: BackRouter, fallback = '/(tabs)/feed') {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback as never);
}
