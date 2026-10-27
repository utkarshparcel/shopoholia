/**
 * WV02-BALANCE-CHECK — refresh merchant balances where an API exists,
 * otherwise drive manual re-check nudges.
 *
 * Decision (see money-reconcile.ts): Worn is source of truth for the vault
 * cache; merchant balances are the external mirror we periodically refresh.
 */

import {
  merchantBalanceCapability,
  needsBalanceRecheckReminder,
  type BalanceCheckResponse,
} from "@worn/shared";
import { ledgerRefId } from "@worn/db";
import type { MoneyAccountRecord, Repositories } from "./repositories/types.js";
import { scheduleBalanceRecheckReminder } from "./balance-check-jobs.js";

/** Upper bound on one merchant balance API call (audit API 11). */
export const MERCHANT_BALANCE_TIMEOUT_MS = 10_000;

export type MerchantBalanceFetchResult = {
  balanceMinor: number;
  source: "api" | "stub";
};

/**
 * Fetch a merchant balance. When `MERCHANT_BALANCE_API_URL` is set, POSTs
 * `{ merchant, currency, hintBalanceMinor }` and expects `{ balanceMinor }`.
 * Otherwise uses an in-process stub that returns the hint (no drift) so
 * api-capable merchants still exercise the refresh path in tests/dev.
 */
export async function fetchMerchantBalance(input: {
  merchant: string;
  currency: string;
  hintBalanceMinor: number;
  /** Test / env override of the remote balance. */
  stubBalanceMinor?: number;
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
}): Promise<MerchantBalanceFetchResult> {
  const env = input.env ?? process.env;
  const url = env.MERCHANT_BALANCE_API_URL;
  if (url) {
    const fetchFn = input.fetchImpl ?? fetch;
    const res = await fetchFn(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        merchant: input.merchant,
        currency: input.currency,
        hintBalanceMinor: input.hintBalanceMinor,
      }),
      signal: AbortSignal.timeout(input.timeoutMs ?? MERCHANT_BALANCE_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`merchant balance API HTTP ${res.status}`);
    }
    const body = (await res.json()) as { balanceMinor?: number };
    if (
      typeof body.balanceMinor !== "number" ||
      !Number.isFinite(body.balanceMinor) ||
      body.balanceMinor < 0
    ) {
      throw new Error("merchant balance API returned invalid balanceMinor");
    }
    return { balanceMinor: Math.floor(body.balanceMinor), source: "api" };
  }

  const stub =
    input.stubBalanceMinor ??
    (env.MERCHANT_BALANCE_STUB_MINOR != null
      ? Number(env.MERCHANT_BALANCE_STUB_MINOR)
      : input.hintBalanceMinor);
  if (!Number.isFinite(stub) || stub < 0) {
    return { balanceMinor: input.hintBalanceMinor, source: "stub" };
  }
  return { balanceMinor: Math.floor(stub), source: "stub" };
}

/**
 * Sets the account to `newBalanceMinor` under the account lock, so the delta
 * is computed from the locked balance rather than the caller's stale copy.
 * Without a client key the ref is derived from the account's last ledger row
 * and the target, so a retried or concurrent identical check posts once.
 * An unchanged balance only resets the re-check clock (no ledger row).
 */
async function applyBalanceDelta(
  repos: Repositories,
  account: MoneyAccountRecord,
  newBalanceMinor: number,
  idempotencyKey?: string,
): Promise<{ balanceMinor: number; adjusted: boolean }> {
  const result = await repos.setMoneyAccountBalance({
    accountId: account.id,
    userId: account.userId,
    targetMinor: newBalanceMinor,
    refType: "BALANCE_CHECK",
    refId: ({ lastLedgerId }) =>
      idempotencyKey ??
      ledgerRefId(
        "credit.balance_check",
        account.id,
        lastLedgerId ?? "none",
        String(newBalanceMinor),
      ),
  });
  return { balanceMinor: result.balanceAfter, adjusted: result.delta !== 0 };
}

export async function runBalanceCheck(
  repos: Repositories,
  account: MoneyAccountRecord,
  opts: {
    stubBalanceMinor?: number;
    fetchImpl?: typeof fetch;
    env?: Record<string, string | undefined>;
    now?: Date;
  } = {},
): Promise<BalanceCheckResponse> {
  const capability = merchantBalanceCapability(account.merchant);
  const previous = account.balanceCacheMinor;

  if (capability.mode === "api" && capability.apiCapable) {
    const fetched = await fetchMerchantBalance({
      merchant: account.merchant,
      currency: account.currency,
      hintBalanceMinor: previous,
      stubBalanceMinor: opts.stubBalanceMinor,
      fetchImpl: opts.fetchImpl,
      env: opts.env,
    });
    const applied = await applyBalanceDelta(repos, account, fetched.balanceMinor);
    const refreshed = await repos.findMoneyAccount(account.id, account.userId);
    if (refreshed) {
      await scheduleBalanceRecheckReminder(refreshed, { now: opts.now });
    }
    return {
      mode: "api",
      refreshed: true,
      balanceMinor: applied.balanceMinor,
      previousBalanceMinor: previous,
      checkUrl: capability.checkUrl,
      message:
        applied.adjusted
          ? `Updated ${account.merchant} balance from merchant ${fetched.source}.`
          : `${account.merchant} balance matches merchant ${fetched.source}.`,
    };
  }

  // Manual path — do not invent a balance; nudge the user to re-check.
  await scheduleBalanceRecheckReminder(account, { now: opts.now });
  return {
    mode: "manual",
    refreshed: false,
    balanceMinor: previous,
    previousBalanceMinor: previous,
    checkUrl: capability.checkUrl,
    message: capability.checkUrl
      ? `No balance API for ${account.merchant}. Open the merchant page and confirm the balance in WORN.`
      : `No balance API for ${account.merchant}. Check the merchant app/site and confirm the balance in WORN.`,
  };
}

export async function confirmManualBalance(
  repos: Repositories,
  account: MoneyAccountRecord,
  balanceMinor: number,
  opts: { idempotencyKey?: string; now?: Date } = {},
): Promise<{ balanceMinor: number; adjusted: boolean }> {
  const applied = await applyBalanceDelta(
    repos,
    account,
    balanceMinor,
    opts.idempotencyKey,
  );
  const refreshed = await repos.findMoneyAccount(account.id, account.userId);
  if (refreshed) {
    await scheduleBalanceRecheckReminder(refreshed, { now: opts.now });
  }
  return applied;
}

export function balanceCheckMetaForAccount(
  account: MoneyAccountRecord,
  opts: { now?: Date } = {},
) {
  const capability = merchantBalanceCapability(account.merchant);
  const last = account.updatedAt;
  return {
    lastBalanceCheckedAt: last.toISOString(),
    balanceCheck: {
      mode: capability.mode,
      due: needsBalanceRecheckReminder(last, { now: opts.now }),
      checkUrl: capability.checkUrl,
    },
  };
}
