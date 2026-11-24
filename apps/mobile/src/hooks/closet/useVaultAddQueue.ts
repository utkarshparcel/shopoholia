import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { addCredit } from '@/src/api/client';
import {
  flushVaultAddQueue,
  readVaultAddQueue,
  subscribeVaultAddQueue,
  type VaultAddFlushResult,
  type VaultAddQueueSnapshot,
} from '@/src/lib/vaultAddQueue';

const EMPTY: VaultAddQueueSnapshot = { items: [], lastFlushError: null };

/**
 * S1-26 — one view of the offline gift-card add queue for every component on the vault.
 *
 * The snapshot re-reads after any change to the stored queue, so a flush started anywhere
 * (auto-sync, "Retry sync", the screen's offline banner) updates every pending row. `flush`
 * refetches the gift-card list when cards reached the server, so they appear at once.
 */
export function useVaultAddQueue(userId: string | null) {
  const queryClient = useQueryClient();
  const [snapshot, setSnapshot] = useState<VaultAddQueueSnapshot>(EMPTY);
  const readSeq = useRef(0);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      const seq = ++readSeq.current;
      void readVaultAddQueue(userId).then((snap) => {
        // A slower, older read must not overwrite a newer one.
        if (active && seq === readSeq.current) setSnapshot(snap);
      });
    };
    refresh();
    const unsubscribe = subscribeVaultAddQueue(refresh);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [userId]);

  const flush = useCallback(
    async (accessToken: string): Promise<VaultAddFlushResult | null> => {
      if (!userId) return null;
      const result = await flushVaultAddQueue(userId, (body) => addCredit(accessToken, body));
      if (result.sentCount > 0) {
        void queryClient.invalidateQueries({ queryKey: ['gift-cards'] });
      }
      return result;
    },
    [userId, queryClient],
  );

  return { ...snapshot, flush };
}
