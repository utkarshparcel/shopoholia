/**
 * U013 — vault credit search + filter chips (client-side).
 */

export type VaultSearchAccount = {
  id: string;
  merchant: string;
  kind: string;
  balanceCacheMinor: number;
  expiresAt?: string | Date | null;
};

export type VaultExpiryWindow = "any" | "7d" | "30d" | "expired" | "none";

export type VaultSearchFilters = {
  /** Debounced merchant query (case-insensitive substring). */
  q?: string;
  /** When set, restrict to these kinds (empty = all). */
  kinds?: string[];
  expiryWindow?: VaultExpiryWindow;
  /** When true, only accounts with balanceCacheMinor > 0. */
  balancePositive?: boolean;
  now?: Date;
};

const MS_DAY = 86_400_000;

export function vaultSearchEmptyCopy(hasFilters: boolean): string {
  return hasFilters
    ? "No credits match your search or filters."
    : "No credits yet.";
}

export function filterVaultAccounts<T extends VaultSearchAccount>(
  accounts: T[],
  filters: VaultSearchFilters = {},
): T[] {
  const now = filters.now ?? new Date();
  const q = (filters.q ?? "").trim().toLowerCase();
  const kinds = (filters.kinds ?? []).map((k) => k.toUpperCase());
  const window = filters.expiryWindow ?? "any";
  const balancePositive = filters.balancePositive === true;

  return accounts.filter((a) => {
    if (q && !a.merchant.toLowerCase().includes(q)) return false;
    if (kinds.length > 0 && !kinds.includes(String(a.kind).toUpperCase())) {
      return false;
    }
    if (balancePositive && !(a.balanceCacheMinor > 0)) return false;

    const exp = a.expiresAt ? new Date(a.expiresAt) : null;
    const hasExp = exp != null && !Number.isNaN(exp.getTime());
    const msLeft = hasExp ? exp!.getTime() - now.getTime() : null;

    switch (window) {
      case "any":
        break;
      case "none":
        if (hasExp) return false;
        break;
      case "expired":
        if (!hasExp || msLeft! >= 0) return false;
        break;
      case "7d":
        if (!hasExp || msLeft! < 0 || msLeft! > 7 * MS_DAY) return false;
        break;
      case "30d":
        if (!hasExp || msLeft! < 0 || msLeft! > 30 * MS_DAY) return false;
        break;
      default:
        break;
    }
    return true;
  });
}

/** True when any non-default filter/search is active. */
export function vaultSearchHasActiveFilters(filters: VaultSearchFilters): boolean {
  if ((filters.q ?? "").trim()) return true;
  if ((filters.kinds ?? []).length > 0) return true;
  if (filters.balancePositive) return true;
  if (filters.expiryWindow && filters.expiryWindow !== "any") return true;
  return false;
}
