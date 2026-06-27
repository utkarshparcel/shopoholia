/**
 * LEGAL DISCLAIMER — INTERNAL CATALOG SCRAPING UTILITIES
 *
 * Rate-limited helpers for building WORN catalog datasets from third-party sites.
 * Bulk scraping may violate retailer Terms of Service and applicable law.
 * Prefer licensed datasets (Bright Data) and official affiliate APIs for production.
 * Obtain legal counsel before production catalog ingestion.
 */
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_HEADERS,
  INTER_REQUEST_DELAY_MS,
  allMatches,
  detectAntiBotSignals,
  fetchPage,
  firstMatch,
  mergeFields,
  parseEmbeddedProductNames,
  parseJsonLdProduct,
  parseOgTags,
  sleep,
  withPlaywright,
} from "../scrape-probes/probe-runner.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(__dirname, "../../../..");
export const CATALOG_DIR = join(REPO_ROOT, "tmp/catalog");

export {
  DEFAULT_HEADERS,
  INTER_REQUEST_DELAY_MS,
  allMatches,
  detectAntiBotSignals,
  fetchPage,
  firstMatch,
  mergeFields,
  parseJsonLdProduct,
  parseOgTags,
  sleep,
  withPlaywright,
};

export type CatalogRow = {
  title: string;
  category: string;
  tags: string[];
  image_urls: string[];
  affiliate_url: string;
  source: string;
  coin_price?: number;
  size?: string;
  color?: string;
};

export type Checkpoint = {
  scrapedUrls: string[];
  completedPages: number[];
  updatedAt: string;
};

export async function ensureCatalogDir(): Promise<void> {
  await mkdir(CATALOG_DIR, { recursive: true });
}

export async function loadCheckpoint(path: string): Promise<Checkpoint> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Checkpoint;
    return {
      scrapedUrls: parsed.scrapedUrls ?? [],
      completedPages: parsed.completedPages ?? [],
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
    };
  } catch {
    return { scrapedUrls: [], completedPages: [], updatedAt: new Date().toISOString() };
  }
}

export async function saveCheckpoint(path: string, checkpoint: Checkpoint): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  checkpoint.updatedAt = new Date().toISOString();
  await writeFile(path, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
}

export async function appendJsonl(path: string, row: CatalogRow): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(row)}\n`, "utf8");
}

export function parsePrice(price?: string): number | undefined {
  if (!price) return undefined;
  const num = Number.parseFloat(price.replace(/[^\d.]/g, ""));
  return Number.isFinite(num) ? Math.round(num) : undefined;
}

export function normalizeProductUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url.split("?")[0] ?? url;
  }
}

export function findNewmeProductLinks(html: string): string[] {
  const relative = allMatches(html, /href=["'](\/product\/[^"'?#]+)["']/gi);
  const absolute = allMatches(html, /href=["'](https:\/\/newme\.asia\/product\/[^"'?#]+)["']/gi);
  const urls = [...relative.map((p) => `https://newme.asia${p}`), ...absolute];
  return [...new Set(urls.map(normalizeProductUrl))];
}

export function parseNewmeTotalPages(html: string): number {
  const ofMatch = firstMatch(html, /Pg\s+\d+\s+of\s+(\d+)/i);
  if (ofMatch) return Number.parseInt(ofMatch, 10);
  const pageLinks = allMatches(html, /[?&]page=(\d+)/gi);
  const nums = pageLinks.map((p) => Number.parseInt(p, 10)).filter((n) => Number.isFinite(n));
  const maxFromLinks = nums.length > 0 ? Math.max(...nums) : 0;
  // ?page=1 shop URLs often only self-reference page=1; fall back to known catalog size.
  if (maxFromLinks <= 1) return 270;
  return maxFromLinks;
}

export function extractNewmeCategory(html: string): string {
  const breadcrumb =
    firstMatch(html, /"breadcrumb"\s*:\s*\[[^\]]*"name"\s*:\s*"([^"]+)"/i) ??
    firstMatch(html, /"category"\s*:\s*"([^"]{2,40})"/i) ??
    firstMatch(html, /BreadcrumbList[\s\S]*?"name"\s*:\s*"([^"]+)"/i);
  if (breadcrumb && !/home|newme|shop/i.test(breadcrumb)) return breadcrumb;
  const fromPath = firstMatch(html, /newme\.asia\/([^/"']+)/i);
  if (fromPath && !/product|shop|cart|account/i.test(fromPath)) {
    return fromPath.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return "Fashion";
}

export function extractNewmeProduct(html: string, url: string): Partial<CatalogRow> {
  const title =
    firstMatch(html, /"name"\s*:\s*"([^"]{8,160})"/) ??
    firstMatch(html, /<h1[^>]*>([^<]+)<\/h1>/i) ??
    parseOgTags(html).title;
  const price =
    firstMatch(html, /"price"\s*:\s*"?([\d.]+)"?/) ??
    firstMatch(html, /₹\s*([\d,]+(?:\.\d+)?)/);
  const images = [
    ...new Set(
      allMatches(
        html,
        /https:\/\/assets\.newme\.asia\/[^"'\s]+\.(?:webp|jpg|jpeg|png)/gi,
      ).filter((img) => /-533x800|-650x975|-683x1025|\.webp$/i.test(img)),
    ),
  ].slice(0, 5);
  const category = extractNewmeCategory(html);
  const color =
    firstMatch(html, /"color"\s*:\s*"([^"]+)"/i) ??
    firstMatch(html, /Color[^<]*<[^>]+>([^<]+)</i);
  const size = firstMatch(html, /"size"\s*:\s*"([^"]+)"/i);

  return {
    title: title?.trim(),
    category,
    tags: [],
    image_urls: images,
    affiliate_url: url,
    source: "newme",
    coin_price: parsePrice(price),
    size,
    color,
  };
}

export function findSheinProductLinks(html: string, baseUrl: string): string[] {
  const origin = new URL(baseUrl).origin;
  const patterns = [
    /href=["'](\/[^"']+-p-\d+\.html)["']/gi,
    /href=["'](https:\/\/[^"']+-p-\d+\.html)["']/gi,
  ];
  const urls: string[] = [];
  for (const pattern of patterns) {
    for (const match of allMatches(html, pattern)) {
      urls.push(match.startsWith("http") ? match : `${origin}${match}`);
    }
  }
  return [...new Set(urls.map(normalizeProductUrl))];
}

export function extractSheinProduct(html: string, url: string): Partial<CatalogRow> {
  const title =
    firstMatch(html, /"goods_name"\s*:\s*"([^"]+)"/) ??
    firstMatch(html, /<h1[^>]*class=["'][^"']*product[^"']*["'][^>]*>([^<]+)</i) ??
    parseOgTags(html).title;
  const price =
    firstMatch(html, /₹\s*([\d,]+)/) ??
    firstMatch(html, /"retailPrice"\s*:\s*"?([\d.]+)"?/);
  const images = [
    ...new Set(
      allMatches(
        html,
        /(?:data-src|src|origin-src)=["'](https:\/\/[^"']*(?:ltwebstatic|shein)[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi,
      ),
    ),
  ].slice(0, 5);
  const category =
    firstMatch(html, /"cat_name"\s*:\s*"([^"]+)"/i) ??
    firstMatch(html, /"category"\s*:\s*"([^"]+)"/i) ??
    "Fashion";

  return {
    title: title?.trim(),
    category,
    tags: [],
    image_urls: images,
    affiliate_url: url,
    source: "shein",
    coin_price: parsePrice(price),
  };
}

export function sheinFetchHeaders(): Record<string, string> {
  return {
    ...DEFAULT_HEADERS,
    Referer: "https://in.shein.com/",
  };
}

export function isBlockedHtml(html: string, status: number): boolean {
  const signals = detectAntiBotSignals(html, status);
  return (
    signals.captcha ||
    signals.forbidden403 ||
    signals.blocked ||
    signals.cloudflare ||
    status >= 400
  );
}

export function toCatalogRow(
  partial: Partial<CatalogRow>,
  source: string,
  fallbackUrl: string,
): CatalogRow | null {
  const title = partial.title?.trim();
  const images = partial.image_urls?.filter(Boolean) ?? [];
  const affiliateUrl = partial.affiliate_url ?? fallbackUrl;
  if (!title || images.length === 0 || !affiliateUrl) return null;
  return {
    title,
    category: partial.category ?? "Fashion",
    tags: partial.tags ?? [],
    image_urls: images,
    affiliate_url: affiliateUrl,
    source: partial.source ?? source,
    coin_price: partial.coin_price,
    size: partial.size,
    color: partial.color,
  };
}
