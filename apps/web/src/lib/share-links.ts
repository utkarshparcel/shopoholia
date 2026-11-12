/**
 * The links the app shares (packages/shared/src: family-share.ts, swap-circle.ts, household.ts,
 * ask-friend.ts, return-poll.ts) and what their landing pages say. public/_redirects maps each
 * `/<prefix>/<code>` onto the static page at `/<prefix>` (Cloudflare, status 200), which reads the
 * code from the address.
 *
 * No imports: the tests run this file in plain Node.
 */

export type ShareKind = 'referral' | 'swap' | 'household' | 'outfit' | 'return';

/** Path prefix of each kind (the part before the code). */
export const SHARE_PREFIX: Record<ShareKind, string> = {
  referral: '/r',
  swap: '/c',
  household: '/h',
  outfit: '/p/outfit',
  return: '/p/return',
};

const POLL_TOKEN = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * The code in a share link's path, or null when there isn't a usable one. Invite and referral codes
 * are normalised the way the app does (upper case, letters and digits, 4 to 20 of them); poll links
 * carry an opaque token (or a legacy poll id) that is only checked for shape.
 */
export function shareCodeFromPath(kind: ShareKind, pathname: string): string | null {
  const prefix = SHARE_PREFIX[kind];
  if (!pathname.startsWith(`${prefix}/`)) return null;
  const rest = pathname.slice(prefix.length + 1).replace(/\/+$/, '');
  if (!rest || rest.includes('/')) return null;
  let raw: string;
  try {
    raw = decodeURIComponent(rest).trim();
  } catch {
    return null;
  }
  if (kind === 'outfit' || kind === 'return') return POLL_TOKEN.test(raw) ? raw : null;
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return code.length >= 4 && code.length <= 20 ? code : null;
}

export type ShareCopy = {
  /** Page title (the layout adds "| Worn") and share-card title. */
  title: string;
  description: string;
  eyebrow: string;
  headline: string;
  body: string;
  /** Whether the code is something the visitor types into the app (invites), not an opaque token. */
  showsCode: boolean;
  codeLabel: string;
  steps: readonly string[];
  list: 'play' | 'closet';
  ctaTitle: string;
  ctaBody: string;
  /** Worn Play links once it is in a store (NEXT_PUBLIC_APP_STORE_URL / _PLAY_STORE_URL set). */
  live?: { steps: readonly string[]; ctaTitle: string; ctaBody: string };
};

const CLOSET_NOT_OPEN = 'Worn Closet hasn’t opened yet. Join the Closet list below and you’ll hear first when it does.';
const CLOSET_CTA = {
  list: 'closet',
  ctaTitle: 'Hear when Worn Closet opens.',
  ctaBody: 'Worn Closet is the next chapter of Worn, for the clothes you already own. Join the list and we’ll email you when it opens.',
} as const;

export const SHARE_KINDS: Record<ShareKind, ShareCopy> = {
  referral: {
    title: 'You’re invited to Worn',
    description:
      'A friend invited you to Worn Play, the free fashion app where you pay with coins, not money. Here’s their invite code and how to use it.',
    eyebrow: 'Worn · Invite',
    headline: 'A friend invited you to Worn.',
    body: 'Worn Play is a free fashion shopping app where you pay with coins, not money: try real pieces on your own AI avatar, check out, then unbox photos of you wearing them. You start with 500 free coins.',
    showsCode: true,
    codeLabel: 'Their invite code',
    steps: [
      'Join the list below. We’ll email your invite when early access opens.',
      'Get Worn, sign in with Google and add one photo for your avatar.',
      'Open Profile, then Refer & earn, enter the code under “Have a referral code?” and tap Apply. Your friend earns 100 coins when you place your first haul.',
    ],
    list: 'play',
    ctaTitle: 'Get your invite.',
    ctaBody: 'Worn Play is coming to iPhone and Android. Join the list and we’ll email you when early access opens.',
    live: {
      steps: [
        'Download Worn Play, sign in with Google and add one photo for your avatar.',
        'Open Profile, then Refer & earn, enter the code under “Have a referral code?” and tap Apply. Your friend earns 100 coins when you place your first haul.',
      ],
      ctaTitle: 'Get Worn Play.',
      ctaBody: 'Free to download. You start with 500 coins.',
    },
  },
  swap: {
    title: 'You’re invited to a swap circle',
    description: 'A friend invited you to their private swap circle on Worn Closet, where friends lend and borrow pieces from each other’s closets.',
    eyebrow: 'Worn Closet · Swap circle',
    headline: 'You’re invited to a swap circle.',
    body: 'A friend wants you in their private swap circle on Worn Closet: an invite-only group of friends who lend and borrow pieces from each other’s closets.',
    showsCode: true,
    codeLabel: 'Invite code',
    steps: [CLOSET_NOT_OPEN, 'Then open the swap circle in Worn Closet and enter this code under “Join with invite”.'],
    ...CLOSET_CTA,
  },
  household: {
    title: 'You’re invited to a shared closet',
    description: 'Someone invited you to their household on Worn Closet: one shared wardrobe and one shared vault for the people you live with.',
    eyebrow: 'Worn Closet · Household',
    headline: 'You’re invited to a shared closet.',
    body: 'Someone wants you in their household on Worn Closet, where the people you live with share one wardrobe and keep gift cards and store credit in one shared vault.',
    showsCode: true,
    codeLabel: 'Invite code',
    steps: [CLOSET_NOT_OPEN, 'Then open Household in Worn Closet and enter this code under “Join with invite”.'],
    ...CLOSET_CTA,
  },
  outfit: {
    title: 'Which look should they wear?',
    description: 'A friend shared a Worn Closet poll to ask which outfit to wear.',
    eyebrow: 'Worn Closet · Ask a friend',
    headline: 'Which look should they wear?',
    body: 'A friend shared a Worn Closet poll to ask which of their outfits to wear. This page can’t show the poll: Worn Closet hasn’t opened yet.',
    showsCode: false,
    codeLabel: '',
    steps: ['Reply to your friend with your pick. The looks are listed in the message they sent.', CLOSET_NOT_OPEN],
    ...CLOSET_CTA,
  },
  return: {
    title: 'Keep it or return it?',
    description: 'A friend shared a Worn Closet poll to ask whether to keep something they bought or send it back.',
    eyebrow: 'Worn Closet · Should I return it?',
    headline: 'Keep it or return it?',
    body: 'A friend shared a Worn Closet poll to ask whether to keep something they bought or send it back. This page can’t show the poll: Worn Closet hasn’t opened yet.',
    showsCode: false,
    codeLabel: '',
    steps: ['Tell your friend what you think: keep it, or send it back.', CLOSET_NOT_OPEN],
    ...CLOSET_CTA,
  },
};
