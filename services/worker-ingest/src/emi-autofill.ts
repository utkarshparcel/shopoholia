/**
 * U007 — Create EMI plan from a parsed SMS signal (idempotent by provider+due+amount).
 */
import type { ParsedEmiSignal } from "./parsers/emi-detect.js";

export type EmiAutofillRepos = {
  findActiveByKey(input: {
    userId: string;
    provider: string;
    nextDueOn: string;
    installmentMinor: number;
  }): Promise<{ id: string } | null>;
  createPlan(input: {
    userId: string;
    provider: string;
    merchant: string | null;
    principalMinor: number;
    remainingMinor: number;
    installmentMinor: number;
    nextDueOn: string;
    currency: string;
  }): Promise<{ id: string }>;
  track?(name: string, properties?: Record<string, unknown>): void;
};

export type EmiAutofillResult = {
  planId: string;
  created: boolean;
};

export async function autofillEmiFromSignal(
  repos: EmiAutofillRepos,
  input: { userId: string; signal: ParsedEmiSignal; documentId?: string },
): Promise<EmiAutofillResult | null> {
  const { signal, userId } = input;
  if (signal.installmentMinor <= 0 || !signal.nextDueOn) return null;

  const existing = await repos.findActiveByKey({
    userId,
    provider: signal.provider,
    nextDueOn: signal.nextDueOn,
    installmentMinor: signal.installmentMinor,
  });
  if (existing) {
    return { planId: existing.id, created: false };
  }

  const plan = await repos.createPlan({
    userId,
    provider: signal.provider,
    merchant: signal.merchant,
    principalMinor: signal.principalMinor,
    remainingMinor: signal.remainingMinor,
    installmentMinor: signal.installmentMinor,
    nextDueOn: signal.nextDueOn,
    currency: signal.currency,
  });

  repos.track?.("emi_from_sms", {
    userId,
    planId: plan.id,
    provider: signal.provider,
    documentId: input.documentId,
  });

  return { planId: plan.id, created: true };
}
