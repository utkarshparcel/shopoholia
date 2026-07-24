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

const SITE = "shein";

const SEARCH_URLS = [
  "https://in.shein.com/pdsearch/women%20tops/?ici=s1`EditSearch`women%20tops`_fb`d0`PageHome&search_source=1&search_type=all&src_identifier=st%3D2%60qu%3Dwomen%20tops%60sc%3D0%60sr%3D0%60ps%3D1&src_module=search&src_tab_page_id=page_home1770123456789",
  "https://www.shein.in/pdsearch/dresses/",
];

export async function probeShein(): Promise<ProbeResult> {
  let lastError: string | undefined;

  for (const searchUrl of SEARCH_URLS) {
    try {
      const search = await fetchPage(searchUrl, {
        ...fetchHeaders(),
      });
      let fields = mergeFields(
        parseOgTags(search.html),
        extractSheinCards(search.html, searchUrl),
      );
      let method: "fetch" | "playwright" = "fetch";
      let totalLatency = search.latencyMs;
      let lastHtml = search.html;
      let lastStatus = search.status;

      const productUrl = fields.url ?? findSheinProductLink(search.html, searchUrl);
      if (productUrl) {
        await sleep(INTER_REQUEST_DELAY_MS);
        const product = await fetchPage(productUrl, { ...fetchHeaders() });
        totalLatency += product.latencyMs;
        lastHtml = product.html;
        lastStatus = product.status;
        fields = mergeFields(
          fields,
          parseJsonLdProduct(product.html),
          parseOgTags(product.html),
          extractSheinProduct(product.html, productUrl),
        );
      }

      if (!isComplete(fields)) {
        await sleep(INTER_REQUEST_DELAY_MS);
        const pw = await playwrightFetch(productUrl ?? searchUrl, 5000);
        method = "playwright";
        totalLatency += pw.latencyMs;
        lastHtml = pw.html;
        lastStatus = pw.status;
        fields = mergeFields(
          fields,
          parseJsonLdProduct(pw.html),
          parseOgTags(pw.html),
          extractSheinCards(pw.html, searchUrl),
          extractSheinProduct(pw.html, productUrl ?? searchUrl),
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
          skuCountHint: "45M+ global (commercial dataset recommended)",
          fullCatalogHours: "Weeks DIY; hours via Bright Data ($250/100k)",
          notes: "Heavy anti-bot; prefer licensed dataset over scrape",
        },
      );
      await saveProbeOutputs(result, "shein");
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  const result = buildResult(SITE, "fetch", 0, "", 0, { images: [] }, lastError);
  await saveProbeOutputs(result, "shein");
  return result;
}

function fetchHeaders(): Record<string, string> {
  return {
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-IN,en;q=0.9",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    Referer: "https://in.shein.com/",
  };
}

function isComplete(fields: { title?: string; images: string[]; url?: string }): boolean {
  return Boolean(fields.title && fields.images.length > 0 && fields.url);
}

function findSheinProductLink(html: string, baseUrl: string): string | undefined {
  const rel =
    firstMatch(html, /href=["'](\/[^"']+-p-\d+\.html)["']/i) ??
    firstMatch(html, /href=["'](\/pdsearch\/[^"']+)["']/i);
  if (!rel) return undefined;
  if (rel.startsWith("http")) return rel;
  const origin = new URL(baseUrl).origin;
  return `${origin}${rel}`;
}

function extractSheinCards(
  html: string,
  baseUrl: string,
): Partial<{ title?: string; price?: string; images: string[]; url?: string }> {
  const url = findSheinProductLink(html, baseUrl);
  const title = firstMatch(html, /class=["'][^"']*goods-title[^"']*["'][^>]*title=["']([^"']+)["']/i);
  const images = allMatches(html, /(?:data-src|src)=["'](https:\/\/[^"']*shein[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/i).slice(
    0,
    3,
  );
  const price =
    firstMatch(html, /₹\s*([\d,]+)/) ??
    firstMatch(html, /"retailPrice"\s*:\s*"?([\d.]+)"?/);
  return { title, price, images, url };
}

function extractSheinProduct(
  html: string,
  url: string,
): Partial<{ title?: string; price?: string; images: string[]; url?: string }> {
  const title =
    firstMatch(html, /<h1[^>]*class=["'][^"']*product[^"']*["'][^>]*>([^<]+)</i) ??
    firstMatch(html, /"goods_name"\s*:\s*"([^"]+)"/);
  const price =
    firstMatch(html, /₹\s*([\d,]+)/) ??
    firstMatch(html, /"retailPrice"\s*:\s*"?([\d.]+)"?/);
  const images = allMatches(
    html,
    /(?:data-src|src|origin-src)=["'](https:\/\/[^"']*(?:ltwebstatic|shein)[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/i,
  ).slice(0, 5);
  return { title, price, images, url };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  probeShein().then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.success ? 0 : 1);
  });
}
