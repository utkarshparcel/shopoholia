/**
 * W011 — iOS forwarding-address wizard.
 * iOS cannot READ_SMS; forwarding is the only SMS path. No READ_SMS marketing.
 */

export type IosForwardWizardStepId = 1 | 2 | 3;

export type IosForwardWizardStep = {
  step: IosForwardWizardStepId;
  title: string;
  body: string;
  cta: string;
};

/** Stable plus-address for the user's forwarding inbox (Mail routing). */
export function buildIosForwardAddress(opts?: {
  baseAddress?: string;
  userKey?: string | null;
}): string {
  const base =
    opts?.baseAddress ??
    process.env.EXPO_PUBLIC_FORWARDING_ADDRESS ??
    'forward@inbox.shopoholia.app';
  const key = (opts?.userKey ?? '').trim();
  if (!key) return base;
  const at = base.lastIndexOf('@');
  if (at <= 0) return base;
  const local = base.slice(0, at);
  const domain = base.slice(at + 1);
  const slug = key
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 16);
  if (!slug) return base;
  return `${local}+${slug}@${domain}`;
}

export function getIosForwardWizardSteps(address: string): IosForwardWizardStep[] {
  return [
    {
      step: 1,
      title: 'Create your forward address',
      body: `Copy ${address} — this is your Worn forwarding inbox for order, shipping, and gift-card texts.`,
      cta: 'Copy address',
    },
    {
      step: 2,
      title: 'Add a Mail / Messages rule',
      body:
        'In Mail or Messages, forward order and shipping texts to that address. On iPhone, apps cannot read SMS — forwarding is the only path.',
      cta: 'Next',
    },
    {
      step: 3,
      title: 'Send a test ping',
      body:
        'Forward one recent order or gift-card text to your address. We’ll watch for it — or skip and connect email only.',
      cta: 'I’ve sent a test',
    },
  ];
}

export function nextIosForwardStep(
  current: IosForwardWizardStepId,
): IosForwardWizardStepId | null {
  if (current === 1) return 2;
  if (current === 2) return 3;
  return null;
}

export function previousIosForwardStep(
  current: IosForwardWizardStepId,
): IosForwardWizardStepId | null {
  if (current === 3) return 2;
  if (current === 2) return 1;
  return null;
}

/** Wizard copy must never market READ_SMS on iOS. */
export function assertsNoReadSmsMarketing(copy: string): boolean {
  return !/READ_SMS/i.test(copy);
}

export function iosForwardWizardJoinedCopy(address: string): string {
  return getIosForwardWizardSteps(address)
    .map((s) => `${s.title}. ${s.body}`)
    .join(' ');
}
