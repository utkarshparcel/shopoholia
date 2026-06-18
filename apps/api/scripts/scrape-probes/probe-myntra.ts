/**
 * LEGAL DISCLAIMER — R&D FEASIBILITY PROBE ONLY (see probe-runner.ts)
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

const SITE = "myntra";
const SEARCH_URL =
  "https://www.myntra.com/women-tops?rawQuery=women%20tops";

export async function probeMyntra(): Promise<ProbeResult> {
  try {
    const search = await fetchPage(SEARCH_URL, myntraHeaders());
    let fields = mergeFields(
      parseOgTags(search.html),
      extractMyntraCards(search.html),
    );
    let method: "fetch" | "playwright" = "fetch";
    let totalLatency = search.latencyMs;
    let lastHtml = search.html;
    let lastStatus = search.status;

    const productUrl = fields.url ?? findMyntraProductLink(search.html);
    if (productUrl && !isComplete(fields)) {
      await sleep(INTER_REQUEST_DELAY_MS);
      const product = await fetchPage(productUrl, myntraHeaders());
      totalLatency += product.latencyMs;
      lastHtml = product.html;
      lastStatus = product.status;
      fields = mergeFields(
        fields,
        parseJsonLdProduct(product.html),
        parseOgTags(product.html),
        extractMyntraProduct(product.html, productUrl),
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
        extractMyntraCards(pw.html),
      );
    }

    const result = buildResult(
      SITE,
      method,
      totalLatency,
      lastHtml,
      lastStatus,
      fields,
      undefined,
      {
        skuCountHint: "Millions (fashion)",
        fullCatalogHours: "Not feasible via scrape; affiliate APIs only",
        notes: "No bulk API; Cuelinks/Vcommission deep links",
      },
    );
    await saveProbeOutputs(result, "myntra");
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
    await saveProbeOutputs(result, "myntra");
    return result;
  }
}

function myntraHeaders(): Record<string, string> {
  return {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-IN,en;q=0.9",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    Referer: "https://www.myntra.com/",
  };
}

function isComplete(fields: { title?: string; images: string[]; url?: string }): boolean {
  return Boolean(fields.title && fields.images.length > 0 && fields.url);
}

function findMyntraProductLink(html: string): string | undefined {
  const rel = firstMatch(html, /href=["'](\/[^"']+\/buy)/i);
  if (rel) return `https://www.myntra.com${rel}`;
  return firstMatch(html, /href=["'](https:\/\/www\.myntra\.com\/[^"']+\/buy)["']/i);
}

function extractMyntraCards(html: string): Partial<{
  title?: string;
  price?: string;
  images: string[];
  url?: string;
}> {
  const url = findMyntraProductLink(html);
  const title =
    firstMatch(html, /class=["']product-product[^"']*["'][^>]*>([^<]+)</i) ??
    firstMatch(html, /"productName"\s*:\s*"([^"]+)"/);
  const images = allMatches(
    html,
    /src=["'](https:\/\/[^"']*(?:myntassets|myntra)[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/i,
  ).slice(0, 3);
  const price =
    firstMatch(html, /₹\s*([\d,]+)/) ??
    firstMatch(html, /"price"\s*:\s*(\d+)/);
  return { title, price, images, url };
}

function extractMyntraProduct(
  html: string,
  url: string,
): Partial<{ title?: string; price?: string; images: string[]; url?: string }> {
  const title =
    firstMatch(html, /<h1[^>]*class=["'][^"']*pdp-title[^"']*["'][^>]*>([^<]+)</i) ??
    firstMatch(html, /"name"\s*:\s*"([^"]+)"/);
  const price = firstMatch(html, /₹\s*([\d,]+)/);
  const images = allMatches(
    html,
    /(?:src|data-src)=["'](https:\/\/[^"']*myntassets[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/i,
  ).slice(0, 5);
  return { title, price, images, url };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  probeMyntra().then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.success ? 0 : 1);
  });
}
