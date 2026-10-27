import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { DelightSource } from '@/src/lib/firstDelight';
import { SAMPLE_MYNTRA_CREDIT } from '@/src/lib/firstDelight';

/** Local demo card shape — mirrors MoneyAccount enough for Vault render. */
export type DemoGiftCard = {
  id: string;
  userId: string;
  kind: 'GIFT_CARD';
  merchant: string;
  currency: string;
  balanceCacheMinor: number;
  expiresAt: string | null;
  status: 'ACTIVE';
  isDemo: true;
};

type ClosetState = {
  connectedSources: string[];
  /** One-shot celebration after first credit / OAuth / demo. */
  justConnected: boolean;
  celebrationSource: DelightSource | null;
  /** User dismissed compact onboarding without adding value. */
  onboardingSkipped: boolean;
  /** User completed add-card / connect / demo path. */
  onboardingCompleted: boolean;
  /** Wall-clock when Closet delight path started (for time_to_found_money). */
  delightStartedAt: number | null;
  /** Ensures time_to_found_money fires once per delight session. */
  foundMoneyTracked: boolean;
  /** In-memory sample card for empty-state demo (no API required). */
  demoAccount: DemoGiftCard | null;
  /** W001 — user exited sample; hide matching API sample row until real add. */
  demoSampleDismissed: boolean;
  /** Wardrobe item IDs opted into the Wear-it-3× challenge. */
  wearChallengeIds: string[];
  /** User started the sell/donate N declutter challenge. */
  declutterChallengeStarted: boolean;
  /** Progressive perms — email after aha; notifications on first deadline. */
  emailPromptSkipped: boolean;
  emailPromptCompleted: boolean;
  deadlineSetupPending: boolean;
  notifPromptSkipped: boolean;
  notifPromptCompleted: boolean;
  notificationsGranted: boolean;
  /** W020 — soonest-expiring focus mode (session-scoped). */
  soonestFocusMode: boolean;
  /** W022 — one-shot loyalty / coupon first-add celebration. */
  loyaltyJustAdded: boolean;
  loyaltyCelebrationKind: 'loyalty' | 'coupons' | null;
  connectEmail: (email: string) => void;
  markJustConnected: (source?: DelightSource) => void;
  clearJustConnected: () => void;
  setSoonestFocusMode: (enabled: boolean) => void;
  markLoyaltyJustAdded: (kind: 'loyalty' | 'coupons') => void;
  clearLoyaltyJustAdded: () => void;
  startDelightClock: (now?: number) => void;
  markOnboardingSkipped: () => void;
  markOnboardingCompleted: () => void;
  seedDemoGiftCard: (now?: number) => DemoGiftCard;
  clearDemoGiftCard: () => void;
  /** W001 — clear sample ledger row + mark dismissed for API twin. */
  exitDemoSample: () => void;
  markFoundMoneyTracked: () => void;
  startWearChallenge: (wardrobeItemId: string) => void;
  completeWearChallenge: (wardrobeItemId: string) => void;
  startDeclutterChallenge: () => void;
  completeDeclutterChallenge: () => void;
  skipEmailPrompt: () => void;
  completeEmailPrompt: () => void;
  markDeadlineSetup: () => void;
  clearDeadlineSetup: () => void;
  skipNotifPrompt: () => void;
  completeNotifPrompt: (granted: boolean) => void;
  clear: () => void;
};

const DEMO_ID = '00000000-0000-4000-8000-demo00000001';

function buildDemoAccount(now = Date.now()): DemoGiftCard {
  const expires = new Date(now + 90 * 86_400_000).toISOString();
  return {
    id: DEMO_ID,
    userId: 'demo-local',
    kind: 'GIFT_CARD',
    merchant: SAMPLE_MYNTRA_CREDIT.merchant,
    currency: SAMPLE_MYNTRA_CREDIT.currency,
    balanceCacheMinor: SAMPLE_MYNTRA_CREDIT.balanceMinor,
    expiresAt: expires,
    status: 'ACTIVE',
    isDemo: true,
  };
}

export const CLOSET_STORE_KEY = 'worn.closet.v1';

/**
 * What survives a restart: onboarding and prompt answers, challenges and the Sample card, so
 * onboarding doesn't repeat on every launch (Plan #11). One-shot celebrations, session modes and
 * connected email addresses stay in memory. `clear()` (sign-out) resets the stored copy too.
 */
function durableClosetState(state: ClosetState) {
  return {
    onboardingSkipped: state.onboardingSkipped,
    onboardingCompleted: state.onboardingCompleted,
    demoAccount: state.demoAccount,
    demoSampleDismissed: state.demoSampleDismissed,
    wearChallengeIds: state.wearChallengeIds,
    declutterChallengeStarted: state.declutterChallengeStarted,
    emailPromptSkipped: state.emailPromptSkipped,
    emailPromptCompleted: state.emailPromptCompleted,
    notifPromptSkipped: state.notifPromptSkipped,
    notifPromptCompleted: state.notifPromptCompleted,
    notificationsGranted: state.notificationsGranted,
  };
}

/**
 * AsyncStorage that reads a corrupt or unreadable copy as none (and removes it). Otherwise
 * hydration would never finish, and the root layout waits for it before showing anything.
 */
const closetStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const raw = await AsyncStorage.getItem(name);
      if (raw !== null) JSON.parse(raw);
      return raw;
    } catch {
      await AsyncStorage.removeItem(name).catch(() => undefined);
      return null;
    }
  },
  setItem: (name: string, value: string) => AsyncStorage.setItem(name, value),
  removeItem: (name: string) => AsyncStorage.removeItem(name),
};

export const useClosetStore = create<ClosetState>()(
  persist(
    (set, get) => ({
      connectedSources: [],
      justConnected: false,
      celebrationSource: null,
      onboardingSkipped: false,
      onboardingCompleted: false,
      delightStartedAt: null,
      foundMoneyTracked: false,
      demoAccount: null,
      demoSampleDismissed: false,
      wearChallengeIds: [],
      declutterChallengeStarted: false,
      emailPromptSkipped: false,
      emailPromptCompleted: false,
      deadlineSetupPending: false,
      notifPromptSkipped: false,
      notifPromptCompleted: false,
      notificationsGranted: false,
      soonestFocusMode: false,
      loyaltyJustAdded: false,
      loyaltyCelebrationKind: null,
      connectEmail: (email) =>
        set((state) => ({
          connectedSources: [...state.connectedSources, email],
          justConnected: true,
          celebrationSource: 'oauth',
          onboardingCompleted: true,
          emailPromptCompleted: true,
        })),
      markJustConnected: (source = 'oauth') =>
        set({
          justConnected: true,
          celebrationSource: source,
          onboardingCompleted: true,
        }),
      clearJustConnected: () => set({ justConnected: false, celebrationSource: null }),
      setSoonestFocusMode: (enabled) => set({ soonestFocusMode: enabled }),
      markLoyaltyJustAdded: (kind) =>
        set({ loyaltyJustAdded: true, loyaltyCelebrationKind: kind }),
      clearLoyaltyJustAdded: () =>
        set({ loyaltyJustAdded: false, loyaltyCelebrationKind: null }),
      startDelightClock: (now = Date.now()) => {
        if (get().delightStartedAt != null) return;
        set({ delightStartedAt: now, foundMoneyTracked: false });
      },
      markOnboardingSkipped: () => set({ onboardingSkipped: true }),
      markOnboardingCompleted: () => set({ onboardingCompleted: true }),
      seedDemoGiftCard: (now = Date.now()) => {
        const demoAccount = buildDemoAccount(now);
        set({
          demoAccount,
          justConnected: true,
          celebrationSource: 'demo',
          onboardingCompleted: true,
          demoSampleDismissed: false,
        });
        return demoAccount;
      },
      clearDemoGiftCard: () => set({ demoAccount: null }),
      exitDemoSample: () =>
        set({
          demoAccount: null,
          demoSampleDismissed: true,
          justConnected: false,
          celebrationSource: null,
        }),
      markFoundMoneyTracked: () => set({ foundMoneyTracked: true }),
      startWearChallenge: (wardrobeItemId) =>
        set((state) =>
          state.wearChallengeIds.includes(wardrobeItemId)
            ? state
            : { wearChallengeIds: [...state.wearChallengeIds, wardrobeItemId] },
        ),
      completeWearChallenge: (wardrobeItemId) =>
        set((state) => ({
          wearChallengeIds: state.wearChallengeIds.filter((id) => id !== wardrobeItemId),
        })),
      startDeclutterChallenge: () => set({ declutterChallengeStarted: true }),
      completeDeclutterChallenge: () => set({ declutterChallengeStarted: false }),
      skipEmailPrompt: () => set({ emailPromptSkipped: true }),
      completeEmailPrompt: () => set({ emailPromptCompleted: true }),
      markDeadlineSetup: () => {
        if (get().notifPromptSkipped || get().notifPromptCompleted || get().notificationsGranted) {
          return;
        }
        set({ deadlineSetupPending: true });
      },
      clearDeadlineSetup: () => set({ deadlineSetupPending: false }),
      skipNotifPrompt: () =>
        set({ notifPromptSkipped: true, deadlineSetupPending: false }),
      completeNotifPrompt: (granted) =>
        set({
          notifPromptCompleted: true,
          notificationsGranted: granted,
          deadlineSetupPending: false,
        }),
      clear: () =>
        set({
          connectedSources: [],
          justConnected: false,
          celebrationSource: null,
          onboardingSkipped: false,
          onboardingCompleted: false,
          delightStartedAt: null,
          foundMoneyTracked: false,
          demoAccount: null,
          demoSampleDismissed: false,
          wearChallengeIds: [],
          declutterChallengeStarted: false,
          emailPromptSkipped: false,
          emailPromptCompleted: false,
          deadlineSetupPending: false,
          notifPromptSkipped: false,
          notifPromptCompleted: false,
          notificationsGranted: false,
          soonestFocusMode: false,
          loyaltyJustAdded: false,
          loyaltyCelebrationKind: null,
        }),
    }),
    {
      name: CLOSET_STORE_KEY,
      version: 1,
      storage: createJSONStorage(() => closetStorage),
      partialize: durableClosetState,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ReturnType<typeof durableClosetState>>;
        const flag = (value: unknown, fallback: boolean) =>
          typeof value === 'boolean' ? value : fallback;
        return {
          ...current,
          onboardingSkipped: flag(p.onboardingSkipped, current.onboardingSkipped),
          onboardingCompleted: flag(p.onboardingCompleted, current.onboardingCompleted),
          demoAccount: p.demoAccount?.isDemo === true ? p.demoAccount : current.demoAccount,
          demoSampleDismissed: flag(p.demoSampleDismissed, current.demoSampleDismissed),
          wearChallengeIds: Array.isArray(p.wearChallengeIds)
            ? p.wearChallengeIds.filter((id): id is string => typeof id === 'string')
            : current.wearChallengeIds,
          declutterChallengeStarted: flag(
            p.declutterChallengeStarted,
            current.declutterChallengeStarted,
          ),
          emailPromptSkipped: flag(p.emailPromptSkipped, current.emailPromptSkipped),
          emailPromptCompleted: flag(p.emailPromptCompleted, current.emailPromptCompleted),
          notifPromptSkipped: flag(p.notifPromptSkipped, current.notifPromptSkipped),
          notifPromptCompleted: flag(p.notifPromptCompleted, current.notifPromptCompleted),
          notificationsGranted: flag(p.notificationsGranted, current.notificationsGranted),
        };
      },
    },
  ),
);
