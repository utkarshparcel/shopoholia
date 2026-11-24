/**
 * Affiliate ids for outbound merchant links. They come from config (the API reads them with
 * `affiliateIdsFromEnv`); there are no defaults. A platform without an id gets an untagged link,
 * never a placeholder id that a network would reject or misattribute.
 */

export const AFFILIATE_PLATFORMS = ["amazon", "flipkart", "myntra", "ajio", "nykaa"] as const;
export type AffiliatePlatform = (typeof AFFILIATE_PLATFORMS)[number];

/** The registered id per platform; a missing or blank one means "don't tag". */
export type AffiliateIds = Partial<Record<AffiliatePlatform, string>>;

/** The query parameter each platform's affiliate programme reads. */
const AFFILIATE_PARAM: Record<AffiliatePlatform, string> = {
  amazon: "tag",
  flipkart: "affid",
  myntra: "ref",
  ajio: "affiliate",
  nykaa: "utm_source",
};

/** Env var per platform (documented in .env.example). */
export const AFFILIATE_ENV_VARS: Record<AffiliatePlatform, string> = {
  amazon: "AFFILIATE_AMAZON_TAG",
  flipkart: "AFFILIATE_FLIPKART_ID",
  myntra: "AFFILIATE_MYNTRA_REF",
  ajio: "AFFILIATE_AJIO_ID",
  nykaa: "AFFILIATE_NYKAA_SOURCE",
};

export function affiliateIdsFromEnv(env: Record<string, string | undefined>): AffiliateIds {
  const ids: AffiliateIds = {};
  for (const platform of AFFILIATE_PLATFORMS) {
    const value = env[AFFILIATE_ENV_VARS[platform]]?.trim();
    if (value) ids[platform] = value;
  }
  return ids;
}

/** `url` with the platform's affiliate parameter set when an id is configured, else unchanged. */
export function tagAffiliateUrl(
  platform: AffiliatePlatform,
  url: string,
  ids: AffiliateIds | null | undefined,
): string {
  const id = ids?.[platform]?.trim();
  if (!id) return url;
  const tagged = new URL(url);
  tagged.searchParams.set(AFFILIATE_PARAM[platform], id);
  return tagged.toString();
}
