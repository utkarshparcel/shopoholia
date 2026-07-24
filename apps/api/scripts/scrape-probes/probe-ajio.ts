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

const SITE = "ajio";
const SEARCH_URL = "https://www.ajio.com/search/?text=women%20tops";

export async function probeAjio(): Promise<ProbeResult> {
  try {
    const search = await fetchPage(SEARCH_URL, ajioHeaders());
    let fields = mergeFields(
      parseOgTags(search.html),
      extractAjioCards(search.html),
    );
    let method: "fetch" | "playwright" = "fetch";
    let totalLatency = search.latencyMs;
    let lastHtml = search.html;
    let lastStatus = search.status;

    const productUrl = fields.url ?? findAjioProductLink(search.html);
    if (productUrl && !isComplete(fields)) {
      await sleep(INTER_REQUEST_DELAY_MS);
      const product = await fetchPage(productUrl, ajioHeaders());
      totalLatency += product.latencyMs;
      lastHtml = product.html;
      lastStatus = product.status;
      fields = mergeFields(
        fields,
        parseJsonLdProduct(product.html),
        parseOgTags(product.html),
        extractAjioProduct(product.html, productUrl),
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
        extractAjioCards(pw.html),
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
        skuCountHint: "Large (Reliance fashion)",
        fullCatalogHours: "Days–weeks; affiliate feed preferred",
        notes: "React SPA; likely needs Playwright + proxies at scale",
      },
    );
    await saveProbeOutputs(result, "ajio");
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
    await saveProbeOutputs(result, "ajio");
    return result;
  }
}

function ajioHeaders(): Record<string, string> {
  return {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-IN,en;q=0.9",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    Referer: "https://www.ajio.com/",
  };
}

function isComplete(fields: { title?: string; images: string[]; url?: string }): boolean {
  return Boolean(fields.title && fields.images.length > 0 && fields.url);
}

function findAjioProductLink(html: string): string | undefined {
  return (
    firstMatch(html, /href=["'](https:\/\/www\.ajio\.com\/[^"']+-p-\d+[^"']*)["']/i) ??
    firstMatch(html, /href=["'](\/[^"']+-p-\d+[^"']*)["']/i)?.replace(/^/, "https://www.ajio.com")
  );
}

function extractAjioCards(html: string): Partial<{
  title?: string;
  price?: string;
  images: string[];
  url?: string;
}> {
  const url = findAjioProductLink(html);
  const title =
    firstMatch(html, /class=["'][^"']*nameCls[^"']*["'][^>]*>([^<]+)</i) ??
    firstMatch(html, /"name"\s*:\s*"([^"]+)"/);
  const images = allMatches(
    html,
    /(?:src|data-src)=["'](https:\/\/[^"']*(?:ajio|ril)[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/i,
  ).slice(0, 3);
  const price = firstMatch(html, /₹\s*([\d,]+)/);
  return { title, price, images, url };
}

function extractAjioProduct(
  html: string,
  url: string,
): Partial<{ title?: string; price?: string; images: string[]; url?: string }> {
  const title =
    firstMatch(html, /<h1[^>]*>([^<]+)<\/h1>/i) ??
    firstMatch(html, /"productName"\s*:\s*"([^"]+)"/);
  const price = firstMatch(html, /₹\s*([\d,]+)/);
  const images = allMatches(
    html,
    /(?:src|data-src)=["'](https:\/\/[^"']*(?:ajio|ril)[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/i,
  ).slice(0, 5);
  return { title, price, images, url };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  probeAjio().then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.success ? 0 : 1);
  });
}
