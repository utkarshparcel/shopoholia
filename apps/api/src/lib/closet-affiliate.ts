/**
 * MON-AFFILIATE-CLOSET — affiliate click plumbing for Closet CTAs
 * (vault Use it now, replace-twin, missing-piece, complete-look).
 */

import { randomUUID } from "node:crypto";
import { normalizeMerchantKey } from "@worn/shared";

export const CLOSET_AFFILIATE_SOURCES = [
  "vault_use_it_now",
  "replace_twin",
  "missing_piece",
  "complete_look",
] as const;

export type ClosetAffiliateSource = (typeof CLOSET_AFFILIATE_SOURCES)[number];

export function isClosetAffiliateSource(value: string): value is ClosetAffiliateSource {
  return (CLOSET_AFFILIATE_SOURCES as readonly string[]).includes(value);
}

/** Map merchant label → cashback platform key (amazon, myntra, …). */
export function platformFromMerchant(merchant: string): string {
  const key = normalizeMerchantKey(merchant);
  if (!key) return "other";
  for (const known of ["amazon", "flipkart", "myntra", "ajio", "nykaa"]) {
    if (key === known || key.startsWith(known) || known.startsWith(key)) return known;
  }
  return key.slice(0, 32) || "other";
}

/** Infer platform from an affiliate / storefront URL when merchant is unknown. */
export function platformFromAffiliateUrl(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("amazon")) return "amazon";
    if (host.includes("flipkart")) return "flipkart";
    if (host.includes("myntra")) return "myntra";
    if (host.includes("ajio")) return "ajio";
    if (host.includes("nykaa")) return "nykaa";
  } catch {
    /* ignore */
  }
  return "other";
}

/**
 * Stable-ish click id for Closet CTAs. Unique per invocation (UUID suffix)
 * so repeated taps still create distinct PENDING cashback_events.
 */
export function buildClosetAffiliateClickId(
  source: ClosetAffiliateSource,
  platform: string,
  opts?: { listingId?: string | null; extra?: string },
): string {
  const plat = (platform || "other").replace(/[^a-z0-9._-]+/gi, "").slice(0, 24) || "other";
  const listing = opts?.listingId ? opts.listingId.slice(0, 36) : "nolisting";
  const extra = opts?.extra ? opts.extra.replace(/[^a-z0-9._-]+/gi, "").slice(0, 24) : "";
  const parts = ["closet", source, plat, listing, extra, randomUUID()].filter(Boolean);
  return parts.join(":");
}
