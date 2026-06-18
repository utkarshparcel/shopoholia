/**
 * LEGAL DISCLAIMER — R&D FEASIBILITY PROBE ONLY (see probe-runner.ts)
 */
import {
  INTER_REQUEST_DELAY_MS,
  allMatches,
  buildResult,
  fetchPage,
  firstMatch,
  isExtractionComplete,
  mergeFields,
  parseEmbeddedProductNames,
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
    const productUrl = findFirstProductLink(shop.html);
    const embeddedNames = parseEmbeddedProductNames(shop.html);
    let fields = mergeFields(extractNewmeShop(shop.html, embeddedNames, productUrl));

    let method: "fetch" | "playwright" = "fetch";
    let totalLatency = shop.latencyMs;
    let lastHtml = shop.html;
    let lastStatus = shop.status;

    if (productUrl && !isExtractionComplete(fields)) {
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
      try {
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
          extractNewmeShop(pw.html, parseEmbeddedProductNames(pw.html), productUrl),
          extractNewmeProduct(pw.html, productUrl ?? findFirstProductLink(pw.html) ?? shopUrl),
        );
      } catch (pwErr) {
        const message = pwErr instanceof Error ? pwErr.message : String(pwErr);
        if (!isExtractionComplete(fields)) {
          const result = buildResult(
            SITE,
            method,
            totalLatency,
            lastHtml,
            lastStatus,
            fields,
            message.includes("SIGSEGV") || message.includes("browser has been closed")
              ? `Playwright unavailable in environment: ${message.slice(0, 120)}`
              : message,
            {
              skuCountHint: "~5.4k–6.5k (270 shop pages)",
              fullCatalogHours: "~3–6h @ 1 req/2s fetch (SSR shop HTML)",
              notes: "Shop page SSR includes product names + image URLs; product pages need fetch",
            },
          );
          await saveProbeOutputs(result, "newme");
          return result;
        }
      }
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
        fullCatalogHours: "~3–6h @ 1 req/2s fetch (SSR shop HTML)",
        notes: "Shop page SSR includes product names + image URLs",
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

function findFirstProductLink(html: string): string | undefined {
  const rel = firstMatch(html, /href=["'](\/product\/[^"'?#]+)["']/i);
  if (rel) return `https://newme.asia${rel}`;
  return firstMatch(html, /href=["'](https:\/\/newme\.asia\/product\/[^"'?#]+)["']/i);
}

function extractNewmeShop(
  html: string,
  embeddedNames: string[],
  productUrl?: string,
): Partial<{ title?: string; price?: string; images: string[]; url?: string }> {
  const url = productUrl ?? findFirstProductLink(html);
  const title = embeddedNames[0];
  const images = allMatches(
    html,
    /https:\/\/assets\.newme\.asia\/[^"'\s]+\.(?:webp|jpg|jpeg|png)/gi,
  )
    .filter((img) => !/\d+x\d+/.test(img) || /-533x800|-650x975|-683x1025/.test(img))
    .slice(0, 3);
  const price =
    firstMatch(html, /"price"\s*:\s*"?([\d.]+)"?/) ??
    firstMatch(html, /₹\s*([\d,]+(?:\.\d+)?)/);
  return { title, price, images, url };
}

function extractNewmeProduct(
  html: string,
  url: string,
): Partial<{ title?: string; price?: string; images: string[]; url?: string }> {
  const title =
    firstMatch(html, /"name"\s*:\s*"([^"]{8,120})"/) ??
    firstMatch(html, /<h1[^>]*>([^<]+)<\/h1>/i);
  const price =
    firstMatch(html, /"price"\s*:\s*"?([\d.]+)"?/) ??
    firstMatch(html, /₹\s*([\d,]+(?:\.\d+)?)/);
  const images = allMatches(
    html,
    /https:\/\/assets\.newme\.asia\/[^"'\s]+\.(?:webp|jpg|jpeg|png)/gi,
  )
    .filter((img) => /-533x800|-650x975|-683x1025|\.webp$/i.test(img))
    .slice(0, 5);
  return { title, price, images, url };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  probeNewme().then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.success ? 0 : 1);
  });
}
