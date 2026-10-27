import { afterEach, describe, expect, it } from 'vitest';

import {
  ANDROID_SMS_PERM_MESSAGE,
  ANDROID_SMS_PERM_UI_BODY,
  assertsOrderTextsOnlyMicrocopy,
  getAndroidSmsPermCopy,
} from './smsPermCopy';

describe('smsPermCopy (W010)', () => {
  it('states order/shipping/gift-card texts only and deny usability', () => {
    const copy = getAndroidSmsPermCopy();
    expect(assertsOrderTextsOnlyMicrocopy(copy.message)).toBe(true);
    expect(assertsOrderTextsOnlyMicrocopy(copy.uiBody)).toBe(true);
    expect(copy.message.toLowerCase()).toMatch(/gift/);
    expect(copy.deniedHint.toLowerCase()).toMatch(/email|manual/);
  });

  it('exports stable permission dialog strings', () => {
    expect(ANDROID_SMS_PERM_MESSAGE).toBe(getAndroidSmsPermCopy().message);
    expect(ANDROID_SMS_PERM_UI_BODY).toBe(getAndroidSmsPermCopy().uiBody);
  });
});

describe('iosForwardWizard (W011)', () => {
  afterEach(() => {
    // no session state
  });

  it('steps address → rule → test ping without READ_SMS marketing', async () => {
    const {
      assertsNoReadSmsMarketing,
      getIosForwardWizardSteps,
      iosForwardWizardJoinedCopy,
      nextIosForwardStep,
    } = await import('./iosForwardWizard');

    const steps = getIosForwardWizardSteps('fwd@example.com');
    expect(steps).toHaveLength(3);
    expect(steps[0]!.body).toContain('fwd@example.com');
    expect(steps[1]!.title.toLowerCase()).toMatch(/mail|rule/);
    expect(steps[2]!.title.toLowerCase()).toMatch(/test/);
    expect(nextIosForwardStep(1)).toBe(2);
    expect(nextIosForwardStep(2)).toBe(3);
    expect(nextIosForwardStep(3)).toBeNull();
    expect(assertsNoReadSmsMarketing(iosForwardWizardJoinedCopy('fwd@example.com'))).toBe(
      true,
    );
  });
});

describe('foundMoneyCountUp (W012)', () => {
  afterEach(async () => {
    const { resetFoundMoneyCountUpSession } = await import('./foundMoneyCountUp');
    resetFoundMoneyCountUpSession();
  });

  it('animates once per session and skips Reduce Motion', async () => {
    const {
      countUpMinor,
      markFoundMoneyCountUpRun,
      resetFoundMoneyCountUpSession,
      shouldAnimateFoundMoneyCountUp,
    } = await import('./foundMoneyCountUp');

    resetFoundMoneyCountUpSession();
    expect(
      shouldAnimateFoundMoneyCountUp({ totalMinor: 50_000, reduceMotion: false }),
    ).toBe(true);
    expect(
      shouldAnimateFoundMoneyCountUp({ totalMinor: 50_000, reduceMotion: true }),
    ).toBe(false);
    expect(
      shouldAnimateFoundMoneyCountUp({ totalMinor: 0, reduceMotion: false }),
    ).toBe(false);

    markFoundMoneyCountUpRun();
    expect(
      shouldAnimateFoundMoneyCountUp({ totalMinor: 50_000, reduceMotion: false }),
    ).toBe(false);

    expect(countUpMinor(0, 1000, 0)).toBe(0);
    expect(countUpMinor(0, 1000, 1)).toBe(1000);
    expect(countUpMinor(0, 1000, 0.5)).toBeGreaterThan(0);
    expect(countUpMinor(0, 1000, 0.5)).toBeLessThan(1000);
  });
});

describe('vaultTrustStrip (W014)', () => {
  it('always covers read-only / revoke / export-delete', async () => {
    const {
      VAULT_TRUST_STRIP_LABEL,
      assertsTrustStripCoversControls,
      getVaultTrustStripLinks,
    } = await import('./vaultTrustStrip');

    expect(assertsTrustStripCoversControls(VAULT_TRUST_STRIP_LABEL)).toBe(true);
    const links = getVaultTrustStripLinks();
    expect(links.map((l) => l.id)).toEqual(['readonly', 'revoke', 'export_delete']);
    expect(links.every((l) => l.href.includes('consent'))).toBe(true);
  });
});

describe('receiptSnap (W009)', () => {
  it('exposes hero CTA copy', async () => {
    const { RECEIPT_SNAP_HERO_HINT, RECEIPT_SNAP_HERO_LABEL } = await import(
      './receiptSnap'
    );
    expect(RECEIPT_SNAP_HERO_LABEL.toLowerCase()).toMatch(/receipt/);
    expect(RECEIPT_SNAP_HERO_HINT.toLowerCase()).toMatch(/confidence|warranty|ocr/);
  });

  it('prefers camera then falls back to library', async () => {
    const { pickReceiptSnapImage } = await import('./receiptSnap');
    const picker = {
      MediaTypeOptions: { Images: 'Images' },
      launchCameraAsync: async () => ({
        canceled: true,
        assets: [],
      }),
      launchImageLibraryAsync: async () => ({
        canceled: false,
        assets: [{ uri: 'file:///receipt.jpg' }],
      }),
    };
    const picked = await pickReceiptSnapImage(picker);
    expect(picked).toEqual({ uri: 'file:///receipt.jpg', source: 'library' });
  });
});
