import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it } from 'vitest';

import { CLOSET_STORE_KEY, useClosetStore } from './closet';

describe('closet store — first delight flags', () => {
  beforeEach(() => useClosetStore.getState().clear());

  it('starts with no connected sources and no celebration', () => {
    const s = useClosetStore.getState();
    expect(s.connectedSources).toEqual([]);
    expect(s.justConnected).toBe(false);
    expect(s.celebrationSource).toBeNull();
    expect(s.onboardingSkipped).toBe(false);
    expect(s.onboardingCompleted).toBe(false);
    expect(s.demoAccount).toBeNull();
  });

  it('connectEmail appends a source and marks oauth celebration', () => {
    useClosetStore.getState().connectEmail('me@example.com');
    expect(useClosetStore.getState().connectedSources).toEqual(['me@example.com']);
    expect(useClosetStore.getState().justConnected).toBe(true);
    expect(useClosetStore.getState().celebrationSource).toBe('oauth');
    expect(useClosetStore.getState().onboardingCompleted).toBe(true);
  });

  it('markJustConnected accepts manual / demo sources', () => {
    useClosetStore.getState().markJustConnected('manual');
    expect(useClosetStore.getState().celebrationSource).toBe('manual');
    useClosetStore.getState().clearJustConnected();
    expect(useClosetStore.getState().justConnected).toBe(false);
    expect(useClosetStore.getState().celebrationSource).toBeNull();
  });

  it('startDelightClock is sticky for time_to_found_money', () => {
    useClosetStore.getState().startDelightClock(1_000);
    useClosetStore.getState().startDelightClock(9_999);
    expect(useClosetStore.getState().delightStartedAt).toBe(1_000);
    expect(useClosetStore.getState().foundMoneyTracked).toBe(false);
    useClosetStore.getState().markFoundMoneyTracked();
    expect(useClosetStore.getState().foundMoneyTracked).toBe(true);
  });

  it('skip and complete onboarding flags', () => {
    useClosetStore.getState().markOnboardingSkipped();
    expect(useClosetStore.getState().onboardingSkipped).toBe(true);
    useClosetStore.getState().clear();
    useClosetStore.getState().markOnboardingCompleted();
    expect(useClosetStore.getState().onboardingCompleted).toBe(true);
  });

  it('seedDemoGiftCard creates ₹500 Myntra sample and celebration', () => {
    const card = useClosetStore.getState().seedDemoGiftCard(1_700_000_000_000);
    expect(card.merchant).toBe('Myntra');
    expect(card.balanceCacheMinor).toBe(50_000);
    expect(card.isDemo).toBe(true);
    expect(useClosetStore.getState().demoAccount?.id).toBe(card.id);
    expect(useClosetStore.getState().justConnected).toBe(true);
    expect(useClosetStore.getState().celebrationSource).toBe('demo');
    expect(useClosetStore.getState().onboardingCompleted).toBe(true);
  });

  it('exitDemoSample clears sample ledger and marks dismissed (W001)', () => {
    useClosetStore.getState().seedDemoGiftCard();
    useClosetStore.getState().exitDemoSample();
    expect(useClosetStore.getState().demoAccount).toBeNull();
    expect(useClosetStore.getState().demoSampleDismissed).toBe(true);
    expect(useClosetStore.getState().justConnected).toBe(false);
    expect(useClosetStore.getState().celebrationSource).toBeNull();
  });

  it('clearDemoGiftCard exits demo mode without wiping other flags', () => {
    useClosetStore.getState().seedDemoGiftCard();
    useClosetStore.getState().markOnboardingCompleted();
    useClosetStore.getState().clearDemoGiftCard();
    expect(useClosetStore.getState().demoAccount).toBeNull();
    expect(useClosetStore.getState().onboardingCompleted).toBe(true);
  });

  it('clear() resets delight flags', () => {
    useClosetStore.getState().seedDemoGiftCard();
    useClosetStore.getState().startDelightClock();
    useClosetStore.getState().markFoundMoneyTracked();
    useClosetStore.getState().clear();
    const s = useClosetStore.getState();
    expect(s.demoAccount).toBeNull();
    expect(s.delightStartedAt).toBeNull();
    expect(s.foundMoneyTracked).toBe(false);
    expect(s.justConnected).toBe(false);
  });

  it('tracks wear-3× challenge opt-in', () => {
    useClosetStore.getState().startWearChallenge('item-a');
    useClosetStore.getState().startWearChallenge('item-a');
    expect(useClosetStore.getState().wearChallengeIds).toEqual(['item-a']);
    useClosetStore.getState().completeWearChallenge('item-a');
    expect(useClosetStore.getState().wearChallengeIds).toEqual([]);
  });

  it('tracks declutter challenge opt-in', () => {
    useClosetStore.getState().startDeclutterChallenge();
    expect(useClosetStore.getState().declutterChallengeStarted).toBe(true);
    useClosetStore.getState().completeDeclutterChallenge();
    expect(useClosetStore.getState().declutterChallengeStarted).toBe(false);
  });

  it('progressive email prompt can be skipped or completed', () => {
    useClosetStore.getState().skipEmailPrompt();
    expect(useClosetStore.getState().emailPromptSkipped).toBe(true);
    useClosetStore.getState().clear();
    useClosetStore.getState().completeEmailPrompt();
    expect(useClosetStore.getState().emailPromptCompleted).toBe(true);
  });

  it('deadline setup arms notification prompt once', () => {
    useClosetStore.getState().markDeadlineSetup();
    expect(useClosetStore.getState().deadlineSetupPending).toBe(true);
    useClosetStore.getState().skipNotifPrompt();
    expect(useClosetStore.getState().notifPromptSkipped).toBe(true);
    expect(useClosetStore.getState().deadlineSetupPending).toBe(false);
    useClosetStore.getState().markDeadlineSetup();
    expect(useClosetStore.getState().deadlineSetupPending).toBe(false);
  });

  it('soonest focus mode persists for the session', () => {
    useClosetStore.getState().setSoonestFocusMode(true);
    expect(useClosetStore.getState().soonestFocusMode).toBe(true);
    useClosetStore.getState().setSoonestFocusMode(false);
    expect(useClosetStore.getState().soonestFocusMode).toBe(false);
  });

  it('loyalty first-add celebration flags', () => {
    useClosetStore.getState().markLoyaltyJustAdded('loyalty');
    expect(useClosetStore.getState().loyaltyJustAdded).toBe(true);
    expect(useClosetStore.getState().loyaltyCelebrationKind).toBe('loyalty');
    useClosetStore.getState().clearLoyaltyJustAdded();
    expect(useClosetStore.getState().loyaltyJustAdded).toBe(false);
    expect(useClosetStore.getState().loyaltyCelebrationKind).toBeNull();
  });
});

describe('closet store — persistence (Plan #11)', () => {
  beforeEach(async () => {
    useClosetStore.getState().clear();
    await AsyncStorage.clear();
  });

  async function stored() {
    const raw = await AsyncStorage.getItem(CLOSET_STORE_KEY);
    return raw ? (JSON.parse(raw) as { state: Record<string, unknown>; version: number }) : null;
  }

  it('stores onboarding answers but not one-shot or session state', async () => {
    const s = useClosetStore.getState();
    s.markOnboardingSkipped();
    s.connectEmail('me@example.com');
    s.setSoonestFocusMode(true);
    s.startWearChallenge('item-1');

    const saved = await stored();
    expect(saved?.version).toBe(1);
    expect(saved?.state).toMatchObject({
      onboardingSkipped: true,
      onboardingCompleted: true,
      emailPromptCompleted: true,
      wearChallengeIds: ['item-1'],
    });
    expect(saved?.state).not.toHaveProperty('connectedSources');
    expect(saved?.state).not.toHaveProperty('justConnected');
    expect(saved?.state).not.toHaveProperty('soonestFocusMode');
  });

  it('restores the stored answers on launch and ignores malformed values', async () => {
    await AsyncStorage.setItem(
      CLOSET_STORE_KEY,
      JSON.stringify({
        state: {
          onboardingCompleted: true,
          notifPromptSkipped: 'yes',
          wearChallengeIds: ['item-2', 7],
          demoAccount: { id: 'x', isDemo: false },
        },
        version: 1,
      }),
    );

    await useClosetStore.persist.rehydrate();

    const s = useClosetStore.getState();
    expect(s.onboardingCompleted).toBe(true);
    expect(s.notifPromptSkipped).toBe(false);
    expect(s.wearChallengeIds).toEqual(['item-2']);
    expect(s.demoAccount).toBeNull();
  });

  it('finishes hydrating from a corrupt copy, with defaults', async () => {
    await AsyncStorage.setItem(CLOSET_STORE_KEY, '{not json');

    await useClosetStore.persist.rehydrate();

    expect(useClosetStore.persist.hasHydrated()).toBe(true);
    expect(useClosetStore.getState().onboardingCompleted).toBe(false);
    expect(await AsyncStorage.getItem(CLOSET_STORE_KEY)).not.toBe('{not json');
  });

  it('clear() (sign-out) resets the stored copy', async () => {
    useClosetStore.getState().markOnboardingCompleted();
    useClosetStore.getState().clear();

    expect((await stored())?.state).toMatchObject({ onboardingCompleted: false });
  });
});
