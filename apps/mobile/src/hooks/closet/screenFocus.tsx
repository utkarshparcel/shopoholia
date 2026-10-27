import { useIsFocused } from 'expo-router';
import type { ReactNode } from 'react';

import { ClosetScreenFocus } from './keys';

/**
 * Pauses a hidden Closet tab's queries (MOB 30). Render it inside each tab's screen, e.g. as the
 * Tabs `screenLayout` in app/(closet)/_layout.tsx, where `useIsFocused` knows the tab.
 */
export function ClosetScreenFocusProvider({ children }: { children: ReactNode }) {
  const focused = useIsFocused();
  return <ClosetScreenFocus.Provider value={focused}>{children}</ClosetScreenFocus.Provider>;
}
