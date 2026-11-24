/**
 * U007 — Create EMI plan from a parsed SMS signal (idempotent by provider+due+amount).
 */
import { and, eq } from "drizzle-orm";
import { emiPlans, users, type Db } from "@worn/db";
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
  /** The user's IANA zone, so "due today" in an SMS is the user's today. */
  userTimeZone?(userId: string): Promise<string | null>;
};

/** `emi_plans`-backed {@link EmiAutofillRepos}: one ACTIVE plan per (user, provider, due day, amount). */
export function createDbEmiAutofillRepos(db: Db, track?: EmiAutofillRepos["track"]): EmiAutofillRepos {
  return {
    async findActiveByKey(input) {
      const [row] = await db
        .select({ id: emiPlans.id })
        .from(emiPlans)
        .where(
          and(
            eq(emiPlans.userId, input.userId),
            eq(emiPlans.provider, input.provider),
            eq(emiPlans.nextDueOn, input.nextDueOn),
            eq(emiPlans.installmentMinor, input.installmentMinor),
            eq(emiPlans.status, "ACTIVE"),
          ),
        )
        .limit(1);
      return row ?? null;
    },
    async createPlan(input) {
      const [row] = await db
        .insert(emiPlans)
        .values({
          userId: input.userId,
          provider: input.provider,
          merchant: input.merchant,
          principalMinor: input.principalMinor,
          remainingMinor: input.remainingMinor,
          installmentMinor: input.installmentMinor,
          nextDueOn: input.nextDueOn,
          // Later installments fall on the same day of the month.
          dueDay: Number(input.nextDueOn.slice(8, 10)) || null,
          currency: input.currency,
          status: "ACTIVE",
        })
        .returning({ id: emiPlans.id });
      return row!;
    },
    async userTimeZone(userId) {
      const [row] = await db.select({ timeZone: users.timeZone }).from(users).where(eq(users.id, userId)).limit(1);
      return row?.timeZone ?? null;
    },
    track,
  };
}

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
