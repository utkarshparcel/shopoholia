/**
 * LEGAL DISCLAIMER — R&D FEASIBILITY PROBE ONLY (see probe-runner.ts)
 *
 * Amazon IN: prefer official Product Advertising API (Creators API) for production.
 * This probe only tests whether a single search-result page is reachable.
 */
import {
  INTER_REQUEST_DELAY_MS,
  allMatches,
  buildResult,
  fetchPage,
  firstMatch,
  mergeFields,
  parseJsonLdProduct,
  parseOgTags,
  playwrightFetch,
  saveProbeOutputs,
  sleep,
} from "./probe-runner.js";
import type { ProbeResult } from "./types.js";

const SITE = "amazon-in";
const SEARCH_URL =
  "https://www.amazon.in/s?k=women+fashion+dress&i=fashion";

export async function probeAmazonIn(): Promise<ProbeResult> {
  try {
    const search = await fetchPage(SEARCH_URL, amazonHeaders());
    let fields = mergeFields(
      parseOgTags(search.html),
      extractAmazonCards(search.html),
    );
    let method: "fetch" | "playwright" = "fetch";
    let totalLatency = search.latencyMs;
    let lastHtml = search.html;
    let lastStatus = search.status;

    const productUrl = fields.url ?? findAmazonProductLink(search.html);
    if (productUrl && !isComplete(fields)) {
      await sleep(INTER_REQUEST_DELAY_MS);
      const product = await fetchPage(productUrl, amazonHeaders());
      totalLatency += product.latencyMs;
      lastHtml = product.html;
      lastStatus = product.status;
      fields = mergeFields(
        fields,
        parseJsonLdProduct(product.html),
        parseOgTags(product.html),
        extractAmazonProduct(product.html, productUrl),
      );
    }

    if (!isComplete(fields)) {
      await sleep(INTER_REQUEST_DELAY_MS);
      const pw = await playwrightFetch(SEARCH_URL, 5000);
      method = "playwright";
      totalLatency += pw.latencyMs;
      lastHtml = pw.html;
      lastStatus = pw.status;
      fields = mergeFields(
        fields,
        parseJsonLdProduct(pw.html),
        parseOgTags(pw.html),
        extractAmazonCards(pw.html),
      );
    }

    const result = buildResult(
      SITE,
      method,
      totalLatency,
      lastHtml,
      lastStatus,
      fields,
      fields.url ? undefined : "Use Amazon Creators / PA-API for production catalog",
      {
        skuCountHint: "Millions (fashion)",
        fullCatalogHours: "Hours via PA-API; scrape not viable",
        notes: "Official API path: Amazon Creators / Product Advertising API",
      },
    );
    await saveProbeOutputs(result, "amazon-in");
    return result;
  } catch (err) {
    const result = buildResult(
      SITE,
      "fetch",
      0,
      "",
      0,
      { images: [] },
      err instanceof Error ? err.message : String(err),
    );
    await saveProbeOutputs(result, "amazon-in");
    return result;
  }
}

function amazonHeaders(): Record<string, string> {
  return {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-IN,en;q=0.9",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    Referer: "https://www.amazon.in/",
  };
}

function isComplete(fields: { title?: string; images: string[]; url?: string }): boolean {
  return Boolean(fields.title && fields.images.length > 0 && fields.url);
}

function findAmazonProductLink(html: string): string | undefined {
  const asin =
    firstMatch(html, /href=["'](\/[^"']*\/dp\/([A-Z0-9]{10}))[^"']*["']/i) ??
    firstMatch(html, /href=["'](https:\/\/www\.amazon\.in\/[^"']*\/dp\/[A-Z0-9]{10})[^"']*["']/i);
  if (!asin) return undefined;
  if (asin.startsWith("http")) return asin.split("?")[0];
  return `https://www.amazon.in${asin.split("?")[0]}`;
}

function extractAmazonCards(html: string): Partial<{
  title?: string;
  price?: string;
  images: string[];
  url?: string;
}> {
  const url = findAmazonProductLink(html);
  const title =
    firstMatch(html, /<span[^>]+class=["'][^"']*a-text-normal[^"']*["'][^>]*>([^<]+)</i) ??
    firstMatch(html, /alt=["']([^"']+)["'][^>]*class=["'][^"']*s-image/i);
  const images = allMatches(
    html,
    /src=["'](https:\/\/[^"']*(?:images-amazon|media-amazon)[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/i,
  ).slice(0, 3);
  const price =
    firstMatch(html, /₹\s*([\d,]+(?:\.\d+)?)/) ??
    firstMatch(html, /class=["']a-price-whole["'][^>]*>([\d,]+)</i);
  return { title, price, images, url };
}

function extractAmazonProduct(
  html: string,
  url: string,
): Partial<{ title?: string; price?: string; images: string[]; url?: string }> {
  const title =
    firstMatch(html, /<span[^>]+id=["']productTitle["'][^>]*>([^<]+)</i) ??
    firstMatch(html, /<h1[^>]*id=["']title["'][^>]*>[\s\S]*?<span[^>]*>([^<]+)</i);
  const price =
    firstMatch(html, /₹\s*([\d,]+(?:\.\d+)?)/) ??
    firstMatch(html, /class=["']a-price-whole["'][^>]*>([\d,]+)</i);
  const images = allMatches(
    html,
    /(?:data-old-hires|src)=["'](https:\/\/[^"']*images-amazon[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/i,
  ).slice(0, 5);
  return { title: title?.trim(), price, images, url };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  probeAmazonIn().then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.success ? 0 : 1);
  });
}
