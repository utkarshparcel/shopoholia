/**
 * LEGAL DISCLAIMER — R&D FEASIBILITY PROBES ONLY
 *
 * Shared runner for minimal, rate-limited scrape feasibility probes.
 * Not for production use. See types.ts for full disclaimer.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AntiBotSignals,
  CatalogSampleRow,
  FieldsExtracted,
  ProbeMethod,
  ProbeResult,
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(__dirname, "../../../..");
export const OUTPUT_DIR = join(REPO_ROOT, "tmp/scrape-probes");
export const INTER_REQUEST_DELAY_MS = 2000;

export const DEFAULT_HEADERS: Record<string, string> = {
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-IN,en;q=0.9",
  "Cache-Control": "no-cache",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
};

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function detectAntiBotSignals(
  html: string,
  status: number,
): AntiBotSignals {
  const lower = html.toLowerCase();
  return {
    captcha:
      lower.includes("captcha") ||
      lower.includes("recaptcha") ||
      lower.includes("hcaptcha") ||
      lower.includes("challenge-platform"),
    forbidden403: status === 403,
    empty: html.trim().length < 500,
    blocked:
      lower.includes("access denied") ||
      lower.includes("request blocked") ||
      lower.includes("unusual traffic"),
    cloudflare:
      lower.includes("cloudflare") &&
      (lower.includes("checking your browser") || lower.includes("cf-browser-verification")),
  };
}

export async function fetchPage(
  url: string,
  headers: Record<string, string> = DEFAULT_HEADERS,
): Promise<{ html: string; status: number; latencyMs: number }> {
  const start = Date.now();
  const response = await fetch(url, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  const html = await response.text();
  return { html, status: response.status, latencyMs: Date.now() - start };
}

export function firstMatch(html: string, pattern: RegExp): string | undefined {
  const match = html.match(pattern);
  return match?.[1]?.trim();
}

export function allMatches(html: string, pattern: RegExp): string[] {
  const results: string[] = [];
  const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  let match: RegExpExecArray | null;
  while ((match = global.exec(html)) !== null) {
    if (match[1]) results.push(match[1].trim());
  }
  return results;
}

export function parseJsonLdProduct(html: string): Partial<FieldsExtracted> {
  const scripts = allMatches(html, /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
  for (const raw of scripts) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const obj = item as Record<string, unknown>;
        const type = String(obj["@type"] ?? "");
        if (!type.toLowerCase().includes("product")) continue;
        const images: string[] = [];
        const imageField = obj.image;
        if (typeof imageField === "string") images.push(imageField);
        else if (Array.isArray(imageField)) {
          for (const img of imageField) {
            if (typeof img === "string") images.push(img);
            else if (img && typeof img === "object" && "url" in img) {
              images.push(String((img as { url: string }).url));
            }
          }
        }
        const offers = obj.offers as Record<string, unknown> | undefined;
        const price =
          offers && typeof offers.price === "string"
            ? offers.price
            : offers && typeof offers.price === "number"
              ? String(offers.price)
              : undefined;
        return {
          title: typeof obj.name === "string" ? obj.name : undefined,
          price,
          images,
          url: typeof obj.url === "string" ? obj.url : undefined,
        };
      }
    } catch {
      // ignore malformed JSON-LD
    }
  }
  return { images: [] };
}

export function parseOgTags(html: string): Partial<FieldsExtracted> {
  const title =
    firstMatch(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ??
    firstMatch(html, /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i) ??
    firstMatch(html, /<title[^>]*>([^<]+)<\/title>/i);
  const image =
    firstMatch(html, /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
    firstMatch(html, /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  const url =
    firstMatch(html, /<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i) ??
    firstMatch(html, /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:url["']/i);
  return {
    title,
    images: image ? [image] : [],
    url,
  };
}

export function mergeFields(
  ...parts: Array<Partial<FieldsExtracted> | undefined>
): FieldsExtracted {
  const merged: FieldsExtracted = { images: [] };
  for (const part of parts) {
    if (!part) continue;
    if (part.title && !merged.title) merged.title = part.title;
    if (part.price && !merged.price) merged.price = part.price;
    if (part.url && !merged.url) merged.url = part.url;
    if (part.images?.length) {
      merged.images = [...new Set([...merged.images, ...part.images])];
    }
  }
  return merged;
}

export function isExtractionComplete(fields: FieldsExtracted): boolean {
  return Boolean(fields.title && fields.images.length > 0 && fields.url);
}

export async function withPlaywright<T>(
  fn: (page: import("playwright").Page) => Promise<T>,
): Promise<T> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent: DEFAULT_HEADERS["User-Agent"],
      locale: "en-IN",
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    return await fn(page);
  } finally {
    await browser.close();
  }
}

export async function playwrightFetch(
  url: string,
  waitMs = 3000,
): Promise<{ html: string; status: number; latencyMs: number }> {
  const start = Date.now();
  const html = await withPlaywright(async (page) => {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await sleep(waitMs);
    return await page.content();
  });
  return { html, status: 200, latencyMs: Date.now() - start };
}

export function buildResult(
  site: string,
  method: ProbeMethod,
  latencyMs: number,
  html: string,
  status: number,
  fields: FieldsExtracted,
  error?: string,
  catalogEstimate?: ProbeResult["catalogEstimate"],
): ProbeResult {
  const antiBotSignals = detectAntiBotSignals(html, status);
  const blocked =
    antiBotSignals.captcha ||
    antiBotSignals.forbidden403 ||
    antiBotSignals.blocked ||
    antiBotSignals.cloudflare;
  const success = isExtractionComplete(fields) && !blocked;
  return {
    site,
    success,
    method,
    latencyMs,
    fieldsExtracted: fields,
    error: error ?? (blocked ? "Anti-bot or access block detected" : undefined),
    antiBotSignals,
    catalogEstimate,
  };
}

export function toCatalogSample(
  fields: FieldsExtracted,
  source: string,
  category = "Fashion",
): CatalogSampleRow | null {
  if (!fields.title || !fields.url || fields.images.length === 0) return null;
  const priceNum = fields.price ? Number.parseFloat(fields.price.replace(/[^\d.]/g, "")) : undefined;
  return {
    title: fields.title,
    category,
    tags: ["probe", source],
    image_urls: fields.images.slice(0, 3),
    affiliate_url: fields.url,
    source,
    coin_price: priceNum && Number.isFinite(priceNum) ? Math.round(priceNum) : undefined,
  };
}

export async function saveProbeOutputs(
  result: ProbeResult,
  catalogSource: string,
): Promise<void> {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const resultPath = join(OUTPUT_DIR, `${result.site}-result.json`);
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  if (result.success) {
    const sample = toCatalogSample(result.fieldsExtracted, catalogSource);
    if (sample) {
      const samplePath = join(OUTPUT_DIR, `${result.site}-catalog-sample.jsonl`);
      await writeFile(samplePath, `${JSON.stringify(sample)}\n`, "utf8");
    }
  }
}

export function formatSummaryRow(result: ProbeResult): string[] {
  const feasible = result.success ? "yes" : "no";
  const blockers: string[] = [];
  if (result.antiBotSignals.captcha) blockers.push("captcha");
  if (result.antiBotSignals.forbidden403) blockers.push("403");
  if (result.antiBotSignals.cloudflare) blockers.push("cloudflare");
  if (result.antiBotSignals.blocked) blockers.push("blocked");
  if (result.antiBotSignals.empty) blockers.push("empty");
  if (result.error && !blockers.length) blockers.push(result.error.slice(0, 40));

  const est =
    result.catalogEstimate?.fullCatalogHours ??
    result.catalogEstimate?.skuCountHint ??
    "unknown";

  return [
    result.site.padEnd(12),
    feasible.padEnd(9),
    result.method.padEnd(11),
    (blockers.join(", ") || "—").slice(0, 28).padEnd(30),
    String(est).slice(0, 24),
  ];
}

export function printSummaryTable(results: ProbeResult[]): void {
  const header = ["Site", "Feasible?", "Method", "Blockers", "Est. full catalog"];
  const widths = header.map((h) => h.length);
  const rows = results.map((r) => {
    const cols = formatSummaryRow(r);
    cols.forEach((c, i) => {
      widths[i] = Math.max(widths[i] ?? 0, c.trim().length);
    });
    return cols;
  });

  const fmt = (cols: string[]) =>
    cols.map((c, i) => c.trim().padEnd(widths[i] ?? 10)).join(" | ");

  console.log("\nScrape feasibility probe summary\n");
  console.log(fmt(header));
  console.log(widths.map((w) => "-".repeat(w)).join("-|-"));
  for (const row of rows) console.log(fmt(row));
  console.log(`\nResults written to ${OUTPUT_DIR}/\n`);
}
