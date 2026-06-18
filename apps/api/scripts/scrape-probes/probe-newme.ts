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

const SITE = "newme";

export async function probeNewme(): Promise<ProbeResult> {
  const shopUrl = "https://newme.asia/shop?page=1";

  try {
    const shop = await fetchPage(shopUrl);
    let fields = mergeFields(
      parseOgTags(shop.html),
      extractNewmeListingCards(shop.html),
    );

    let method: "fetch" | "playwright" = "fetch";
    let totalLatency = shop.latencyMs;
    let lastHtml = shop.html;
    let lastStatus = shop.status;

    const productUrl = fields.url ?? findFirstProductLink(shop.html);
    if (productUrl && (!fields.title || fields.images.length === 0)) {
      await sleep(INTER_REQUEST_DELAY_MS);
      const product = await fetchPage(productUrl);
      totalLatency += product.latencyMs;
      lastHtml = product.html;
      lastStatus = product.status;
      fields = mergeFields(
        fields,
        parseJsonLdProduct(product.html),
        parseOgTags(product.html),
        extractNewmeProduct(product.html, productUrl),
      );
    }

    if (!isExtractionComplete(fields)) {
      await sleep(INTER_REQUEST_DELAY_MS);
      const pw = await playwrightFetch(productUrl ?? shopUrl, 4000);
      method = "playwright";
      totalLatency += pw.latencyMs;
      lastHtml = pw.html;
      lastStatus = pw.status;
      fields = mergeFields(
        fields,
        parseJsonLdProduct(pw.html),
        parseOgTags(pw.html),
        extractNewmeListingCards(pw.html),
        extractNewmeProduct(pw.html, productUrl ?? shopUrl),
      );
      if (!fields.url) fields.url = productUrl ?? findFirstProductLink(pw.html);
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
        skuCountHint: "~5.4k–6.5k (270 shop pages)",
        fullCatalogHours: "~3–6h @ 1 req/2s, no blocks",
        notes: "Shop pagination works; sitemap has no product URLs",
      },
    );
    await saveProbeOutputs(result, "newme");
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
    await saveProbeOutputs(result, "newme");
    return result;
  }
}

function isExtractionComplete(fields: {
  title?: string;
  images: string[];
  url?: string;
}): boolean {
  return Boolean(fields.title && fields.images.length > 0 && fields.url);
}

function findFirstProductLink(html: string): string | undefined {
  const rel = firstMatch(html, /href=["'](\/product\/[^"'?#]+)["']/i);
  if (rel) return `https://newme.asia${rel}`;
  const abs = firstMatch(html, /href=["'](https:\/\/newme\.asia\/product\/[^"'?#]+)["']/i);
  return abs;
}

function extractNewmeListingCards(html: string): Partial<{
  title?: string;
  price?: string;
  images: string[];
  url?: string;
}> {
  const url = findFirstProductLink(html);
  const title =
    firstMatch(html, /alt=["']([^"']+)["'][^>]*class=["'][^"']*product/i) ??
    firstMatch(html, /class=["'][^"']*product[^"']*["'][^>]*alt=["']([^"']+)["']/i);
  const images = allMatches(html, /src=["'](https:\/\/[^"']*newme[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/i).slice(
    0,
    3,
  );
  const price =
    firstMatch(html, /₹\s*([\d,]+(?:\.\d+)?)/) ??
    firstMatch(html, /"price"\s*:\s*"?([\d.]+)"?/);
  return { title, price, images, url };
}

function extractNewmeProduct(
  html: string,
  url: string,
): Partial<{ title?: string; price?: string; images: string[]; url?: string }> {
  const title =
    firstMatch(html, /<h1[^>]*>([^<]+)<\/h1>/i) ??
    firstMatch(html, /"name"\s*:\s*"([^"]+)"/);
  const price =
    firstMatch(html, /₹\s*([\d,]+(?:\.\d+)?)/) ??
    firstMatch(html, /"price"\s*:\s*"?([\d.]+)"?/);
  const images = allMatches(
    html,
    /(?:src|content)=["'](https:\/\/[^"']*(?:assets\.newme|cdn)[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/i,
  ).slice(0, 5);
  return { title, price, images, url };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  probeNewme().then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.success ? 0 : 1);
  });
}
