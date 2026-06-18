/**
 * LEGAL DISCLAIMER — R&D FEASIBILITY PROBE ONLY (see probe-runner.ts)
 *
 * Flipkart: prefer official Flipkart Affiliate API for production catalog.
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

const SITE = "flipkart";
const SEARCH_URL =
  "https://www.flipkart.com/search?q=women+dress&otracker=search&otracker1=search&marketplace=FLIPKART&as-show=on&as=off";

export async function probeFlipkart(): Promise<ProbeResult> {
  try {
    const search = await fetchPage(SEARCH_URL, flipkartHeaders());
    let fields = mergeFields(
      parseOgTags(search.html),
      extractFlipkartCards(search.html),
    );
    let method: "fetch" | "playwright" = "fetch";
    let totalLatency = search.latencyMs;
    let lastHtml = search.html;
    let lastStatus = search.status;

    const productUrl = fields.url ?? findFlipkartProductLink(search.html);
    if (productUrl && !isComplete(fields)) {
      await sleep(INTER_REQUEST_DELAY_MS);
      const product = await fetchPage(productUrl, flipkartHeaders());
      totalLatency += product.latencyMs;
      lastHtml = product.html;
      lastStatus = product.status;
      fields = mergeFields(
        fields,
        parseJsonLdProduct(product.html),
        parseOgTags(product.html),
        extractFlipkartProduct(product.html, productUrl),
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
        extractFlipkartCards(pw.html),
      );
    }

    const result = buildResult(
      SITE,
      method,
      totalLatency,
      lastHtml,
      lastStatus,
      fields,
      fields.url ? undefined : "Use Flipkart Affiliate API for production catalog",
      {
        skuCountHint: "Millions (fashion)",
        fullCatalogHours: "Hours via Affiliate API; scrape blocked at scale",
        notes: "Official API: Flipkart Affiliate product feed",
      },
    );
    await saveProbeOutputs(result, "flipkart");
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
    await saveProbeOutputs(result, "flipkart");
    return result;
  }
}

function flipkartHeaders(): Record<string, string> {
  return {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-IN,en;q=0.9",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    Referer: "https://www.flipkart.com/",
  };
}

function isComplete(fields: { title?: string; images: string[]; url?: string }): boolean {
  return Boolean(fields.title && fields.images.length > 0 && fields.url);
}

function findFlipkartProductLink(html: string): string | undefined {
  const rel =
    firstMatch(html, /href=["'](\/[^"']*-p\/[^"']+)["']/i) ??
    firstMatch(html, /href=["'](\/[^"']*\/p\/itm[^"']+)["']/i);
  if (rel) return `https://www.flipkart.com${rel.split("?")[0]}`;
  const abs = firstMatch(html, /href=["'](https:\/\/www\.flipkart\.com\/[^"']+-p\/[^"']+)["']/i);
  return abs?.split("?")[0];
}

function extractFlipkartCards(html: string): Partial<{
  title?: string;
  price?: string;
  images: string[];
  url?: string;
}> {
  const url = findFlipkartProductLink(html);
  const title =
    firstMatch(html, /class=["'][^"']*KzDlHZ[^"']*["'][^>]*>([^<]+)</i) ??
    firstMatch(html, /alt=["']([^"']+)["'][^>]*class=["'][^"']*DByuf4/i);
  const images = allMatches(
    html,
    /src=["'](https:\/\/[^"']*(?:flipkart|rukminim)[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/i,
  ).slice(0, 3);
  const price = firstMatch(html, /₹\s*([\d,]+)/);
  return { title, price, images, url };
}

function extractFlipkartProduct(
  html: string,
  url: string,
): Partial<{ title?: string; price?: string; images: string[]; url?: string }> {
  const title =
    firstMatch(html, /<span[^>]+class=["'][^"']*VU-ZEz[^"']*["'][^>]*>([^<]+)</i) ??
    firstMatch(html, /<h1[^>]*>([^<]+)<\/h1>/i);
  const price = firstMatch(html, /₹\s*([\d,]+)/);
  const images = allMatches(
    html,
    /(?:src|data-src)=["'](https:\/\/[^"']*(?:flipkart|rukminim)[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/i,
  ).slice(0, 5);
  return { title, price, images, url };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  probeFlipkart().then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.success ? 0 : 1);
  });
}
