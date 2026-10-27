/**
 * W095 — Closet cold-start budget (<2s TTI) + deferred secondary fetches.
 *
 * Critical path (Today): today-outfit + week-outfits.
 * Secondary (packages, wardrobe for dry-clean tile, capsule, rewear) wait until
 * after interactions so first paint stays under budget.
 */

import { useEffect, useState } from 'react';
import { InteractionManager } from 'react-native';

import { trackEvent } from '@/src/lib/analytics';

/** Soft launch budget for Closet reopen → interactive content. */
export const CLOSET_TTI_BUDGET_MS = 2000;

export type ClosetTtiReport = {
  screen: string;
  ttiMs: number;
  withinBudget: boolean;
};

let coldStartAt: number | null = null;
let reportedScreen: string | null = null;
let secondaryReady = false;
const secondaryListeners = new Set<() => void>();

function notifySecondary(): void {
  for (const listener of secondaryListeners) listener();
}

/** Call once when entering Closet critical path (e.g. Today mount). */
export function beginClosetColdStart(now = Date.now()): void {
  if (coldStartAt != null) return;
  coldStartAt = now;
  reportedScreen = null;
}

/** Reset between tests / surface switches. */
export function resetClosetColdStart(): void {
  coldStartAt = null;
  reportedScreen = null;
  secondaryReady = false;
  notifySecondary();
}

export function isClosetSecondaryReady(): boolean {
  return secondaryReady;
}

/**
 * After interactions, allow non-critical Closet queries.
 * Idempotent — safe to call from multiple screens.
 */
export function scheduleClosetSecondaryFetches(): void {
  if (secondaryReady) return;
  const handle = InteractionManager.runAfterInteractions(() => {
    if (secondaryReady) return;
    secondaryReady = true;
    notifySecondary();
  });
  // RN may return a cancellable; ignore cancel for cold-start (one-shot).
  void handle;
}

/** React hook — false until InteractionManager drains. */
export function useClosetSecondaryReady(): boolean {
  const [ready, setReady] = useState(secondaryReady);

  useEffect(() => {
    scheduleClosetSecondaryFetches();
    if (secondaryReady) {
      setReady(true);
      return;
    }
    const onReady = () => setReady(true);
    secondaryListeners.add(onReady);
    return () => {
      secondaryListeners.delete(onReady);
    };
  }, []);

  return ready;
}

/**
 * Mark critical path interactive and log TTI once per cold start.
 * Returns null if begin was never called or already reported.
 */
export function markClosetInteractive(
  screen: string,
  now = Date.now(),
): ClosetTtiReport | null {
  if (coldStartAt == null || reportedScreen != null) return null;
  const ttiMs = Math.max(0, now - coldStartAt);
  reportedScreen = screen;
  const report: ClosetTtiReport = {
    screen,
    ttiMs,
    withinBudget: ttiMs <= CLOSET_TTI_BUDGET_MS,
  };
  logClosetTti(report);
  return report;
}

export function logClosetTti(report: ClosetTtiReport): void {
  trackEvent('closet_cold_start_tti', {
    screen: report.screen,
    tti_ms: report.ttiMs,
    within_budget: report.withinBudget,
    budget_ms: CLOSET_TTI_BUDGET_MS,
  });
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.info(
      `[closet-tti] ${report.screen} ${report.ttiMs}ms` +
        (report.withinBudget ? '' : ` (over ${CLOSET_TTI_BUDGET_MS}ms budget)`),
    );
  }
}

/** Pure helper for tests — whether TTI meets budget. */
export function isClosetTtiWithinBudget(ttiMs: number): boolean {
  return ttiMs <= CLOSET_TTI_BUDGET_MS;
}
