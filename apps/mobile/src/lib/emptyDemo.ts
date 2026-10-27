import { SAMPLE_MYNTRA_CREDIT } from '@/src/lib/firstDelight';
import type { EmptyCopyVariant } from '@/src/lib/closetPrefs';
import { getCopyPack, type CopyPackId } from '@worn/shared';

/** Analytics / store flag key for sample/demo vault mode (ONB-EMPTY-DEMO). */
export const EMPTY_DEMO_FLAG = 'closet_empty_demo' as const;

/** Unmistakable sample badge label (W001). */
export const DEMO_BADGE_LABEL = 'Demo' as const;

export type EmptyDemoSurface =
  | 'vault'
  | 'wardrobe'
  | 'accountant'
  | 'receipts'
  | 'returns'
  | 'today';

export type EmptyDemoCopy = {
  title: string;
  message: string;
  /** CTA label for sample/demo path when surface supports it. */
  demoCta: string | null;
  /** Primary empty CTA (add card / add piece / generate). */
  primaryCta: string | null;
  variant: EmptyCopyVariant;
};

export type DemoAccountLike = {
  isDemo?: boolean;
  balanceCacheMinor?: number;
  merchant?: string;
  pendingSync?: boolean;
} | null;

/** True when local sample/demo gift card is active. */
export function isDemoModeActive(demoAccount: DemoAccountLike): boolean {
  return Boolean(demoAccount?.isDemo);
}

/**
 * True for local demo or API-shaped sample matching Myntra ₹500.
 * Used to show Demo badge + Exit sample (W001).
 */
export function isSampleCreditAccount(account: {
  isDemo?: boolean;
  merchant?: string;
  balanceCacheMinor?: number;
} | null | undefined): boolean {
  if (!account) return false;
  if (account.isDemo) return true;
  return (
    account.merchant === SAMPLE_MYNTRA_CREDIT.merchant &&
    account.balanceCacheMinor === SAMPLE_MYNTRA_CREDIT.balanceMinor
  );
}

/** Fake GC total while demo mode is on (0 when cleared). */
export function demoGiftCardTotalMinor(demoAccount: DemoAccountLike): number {
  if (!isDemoModeActive(demoAccount)) return 0;
  return Math.max(0, demoAccount?.balanceCacheMinor ?? 0);
}

/** Merchant label always marks sample so users never confuse demo with real credit. */
export function demoAccountDisplayName(merchant: string): string {
  const base = merchant.trim() || SAMPLE_MYNTRA_CREDIT.merchant;
  return `${base} (sample)`;
}

const FOUND_MONEY_COPY: Record<
  Exclude<EmptyDemoSurface, 'today'>,
  Omit<EmptyDemoCopy, 'variant'>
> = {
  vault: {
    title: 'Nothing in your vault yet',
    message:
      'Add a gift card, snap a receipt, or try a sample — forgotten credit surfaces here.',
    demoCta: SAMPLE_MYNTRA_CREDIT.label,
    primaryCta: 'Add a gift card',
  },
  wardrobe: {
    title: 'Your closet is empty',
    message:
      'Snap your first piece for cost-per-wear, or peek at sample found money in Vault while you decide.',
    demoCta: SAMPLE_MYNTRA_CREDIT.label,
    primaryCta: 'Add a piece',
  },
  accountant: {
    title: 'No spend to show yet',
    message: 'Import wardrobe costs or add a gift card — the ledger fills as money moves.',
    demoCta: null,
    primaryCta: null,
  },
  receipts: {
    title: 'No receipts yet',
    message: 'Snap your first invoice — GST and totals land here for warranties and returns.',
    demoCta: null,
    primaryCta: 'Snap a receipt',
  },
  returns: {
    title: 'No return windows yet',
    message: 'Add a purchase or connect email — deadlines show up before they expire.',
    demoCta: null,
    primaryCta: null,
  },
};

const OUTFIT_COPY: Record<
  Exclude<EmptyDemoSurface, 'today'>,
  Omit<EmptyDemoCopy, 'variant'>
> = {
  vault: {
    title: 'Vault is quiet',
    message:
      'Found money waits here after you add a card — then Today can dress you without a panic buy.',
    demoCta: SAMPLE_MYNTRA_CREDIT.label,
    primaryCta: 'Add a gift card',
  },
  wardrobe: {
    title: 'Build today’s outfit base',
    message:
      'Add a few pieces you already own — morning looks start from what’s in this closet.',
    demoCta: null,
    primaryCta: 'Add a piece',
  },
  accountant: {
    title: 'No spend to show yet',
    message: 'Log wears and costs — outfits get cheaper the more you rotate them.',
    demoCta: null,
    primaryCta: null,
  },
  receipts: {
    title: 'No receipts yet',
    message: 'Snap invoices so returns and warranties stay tied to what you wear.',
    demoCta: null,
    primaryCta: 'Snap a receipt',
  },
  returns: {
    title: 'No return windows yet',
    message: 'Add a purchase — chase deadlines before an outfit becomes a regret buy.',
    demoCta: null,
    primaryCta: null,
  },
};

const TODAY_FOUND: Omit<EmptyDemoCopy, 'variant'> = {
  title: 'No outfit yet',
  message:
    'Add items to your wardrobe and we’ll generate one for the morning — found money stays in Vault.',
  demoCta: null,
  primaryCta: 'Open wardrobe',
};

const TODAY_OUTFIT: Omit<EmptyDemoCopy, 'variant'> = {
  title: 'Dress from what you own',
  message: 'Add a few wardrobe pieces — we’ll build today’s look without a shopping trip.',
  demoCta: null,
  primaryCta: 'Open wardrobe',
};

/**
 * Personalized empty-state copy per Closet surface.
 * `variant` rotates found-money vs outfit job framing (W004).
 * `copyPackId` switches EN ↔ Hinglish for vault/today (W091).
 * EN keeps W004 variant tables; Hinglish overlays locale pack strings.
 */
export function emptyStateCopy(
  surface: EmptyDemoSurface,
  variant: EmptyCopyVariant = 'found_money',
  copyPackId: CopyPackId = 'en',
): EmptyDemoCopy {
  const pack = getCopyPack(copyPackId);
  if (surface === 'today') {
    const base = variant === 'outfit' ? TODAY_OUTFIT : TODAY_FOUND;
    if (copyPackId === 'en') return { ...base, variant };
    return {
      ...base,
      title: pack.today.emptyTitle,
      message: pack.today.emptyMessage,
      variant,
    };
  }
  const table = variant === 'outfit' ? OUTFIT_COPY : FOUND_MONEY_COPY;
  const base = table[surface];
  if (surface === 'vault' && copyPackId !== 'en') {
    return {
      ...base,
      title: pack.vault.emptyTitle,
      message: pack.vault.emptyMessage,
      variant,
    };
  }
  return { ...base, variant };
}

/** Analytics props for empty CTA taps (W004). */
export function emptyCtaTapProps(
  surface: EmptyDemoSurface,
  variant: EmptyCopyVariant,
  cta: 'primary' | 'demo',
): { surface: string; variant: EmptyCopyVariant; cta: string } {
  return { surface, variant, cta };
}
