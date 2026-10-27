/** N35 / N38 — share helpers for friend polls (thin wrappers over shared). */

export {
  buildReturnPollShare,
  buildAskFriendShare,
  tallyReturnVotes,
  tallyAskFriendVotes,
  isReturnPollExpired,
  resolveAskFriendWinner,
  type AskFriendOption,
  type ReturnPollShareCard,
  type AskFriendShareCard,
} from '@worn/shared';

/** Redacted label for return poll shares (merchant blurred if present). */
export function returnPollItemLabel(input: {
  itemTitle?: string | null;
  merchant?: string | null;
}): string {
  const title = (input.itemTitle ?? '').trim();
  if (title) return title.slice(0, 80);
  const merchant = (input.merchant ?? '').trim();
  if (merchant) return `${merchant.slice(0, 1)}•••• piece`;
  return 'this piece';
}

/** Build 2–3 ask-friend options from today's outfit + alts. */
export function askFriendOptionsFromLooks(
  looks: Array<{
    id?: string;
    itemIds?: string[];
    label?: string;
    categories?: string[];
    occasion?: string | null;
  }>,
): Array<{ id: string; label: string; itemIds: string[]; occasion?: string | null }> {
  return looks.slice(0, 3).map((look, i) => {
    const letter = String.fromCharCode(65 + i);
    const cats = (look.categories ?? []).filter(Boolean).slice(0, 3);
    const label =
      look.label?.trim() ||
      (cats.length ? `Look ${letter} · ${cats.join(' + ')}` : `Look ${letter}`);
    return {
      id: look.id ?? `opt-${i + 1}`,
      label,
      itemIds: look.itemIds ?? [],
      occasion: look.occasion ?? null,
    };
  });
}
