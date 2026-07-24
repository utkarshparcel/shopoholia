# Catalog Sourcing — Shein, Newme, and 100k SKUs

> **Legal disclaimer:** WORN is entertainment-first (“fake shopping”). Any third-party product data, images, or affiliate links must comply with each retailer’s terms, affiliate program rules, and applicable copyright law. Bulk scraping Myntra, Shein, or Newme **violates their ToS** and creates app-store IP risk. This document is planning guidance only — **not legal advice**. Obtain counsel before production ingestion of scraped or licensed third-party catalogs.

---

## Reality check: can we get 100k each?

| Source | Realistic SKU count | 100k feasible? |
|--------|---------------------|----------------|
| **Shein** | 45M+ (global) | **Yes** — via commercial datasets |
| **Newme** | **~5,000–7,000** (see below) | **No** — entire live catalog is an order of magnitude smaller |

### Newme catalog size (verified Jun 2026)

- Shop pagination: **~270 pages** (`newme.asia/shop`, “Pg 264 of 270”).
- ~20–24 products per page → **~5,400–6,500 SKUs** (styles; color/size variants may add ~1.5–2× but still ≪100k).
- `sitemap.xml`: **40 URLs**, all category/landing pages — **no product URLs**.
- `robots.txt` disallows query strings, `/search/`, and `/internal/all-products`.
- Custom stack (nginx + CloudFront), **not Shopify** — no `products.json` public feed.
- Partnership path exists: [Returns FAQ](https://newme.asia/returns-and-exchange) lists “Collaboration with NEWME”.

**Bottom line:** Treat Newme as a **full-catalog ingest (~6k)** for India Gen-Z credibility, not a 100k pillar. Fill the gap with other licensed sources (below).

---

## Ranked acquisition strategy

### Path A — Commercial dataset (recommended for Shein)

**Best for:** Hitting 100k Shein SKUs quickly with defensible licensing.

| Provider | Shein coverage | Pricing model | ~100k cost | Image URLs | Legality |
|----------|----------------|---------------|------------|------------|----------|
| **[Bright Data](https://brightdata.com/products/datasets/shein)** | 45.3M+ records, 41 fields | From **$0.0025/record**, min **$250** | **~$250** | Yes (`Main image`, sliders) | Licensed dataset purchase; still review image use in-app |
| **Oxylabs** | Web Scraper API + e-commerce datasets | Pay-per-request (~$1–8/1k results tiered) | **~$500–2,000+** | Varies | Commercial ToS with provider; target site ToS still applies |
| **ShopAPIS** | Shopify stores only | N/A for Newme | N/A | N/A | Newme is not Shopify |

**Bright Data Shein fields (sample):** product name, description, initial/final price, currency, in stock, color, size, reviews count, main image, category URL, category, country, etc.

**Action:** Request Bright Data demo JSON, validate image URL longevity and India-relevant subset, budget **$250–500** for first 100k–200k rows.

---

### Path B — Hybrid (recommended overall for WORN)

| Slice | Target count | Source | Est. cost |
|-------|--------------|--------|-----------|
| Shein global aesthetic | **100,000** | Bright Data Shein dataset | **~$250** |
| India D2C anchor | **~6,000** | Newme seller/partnership feed OR one-time licensed export | **$0–5k** (partnership TBD) |
| India marketplace depth | **~50,000+** | Flipkart Affiliate API + Amazon Creators API (fashion categories) | API free; rev-share on conversions |
| Long tail Gen-Z India | **~44,000** | Bewakoof, Urbanic, Ajio via Cuelinks/EarnKaro feeds; seller uploads | Affiliate / BD |

**Why this wins:** Shein supplies scroll volume and try-on variety; Newme grounds the feed in India-native brands; affiliate APIs provide legitimate images + deep links for “Buy the real thing.”

---

### Path C — Scrape architecture (only with explicit legal sign-off)

**Do not run in production without legal review.**

| Component | Shein @100k | Newme @6k |
|-----------|-------------|-----------|
| Apify `ruly_optimism/shein-product-scraper` | **~$2,000** ($0.02/result) | N/A |
| Apify `scraper-engine/shein-search-products-scraper` | **~$500** ($0.00499/result) | N/A |
| Custom scraper + residential proxies | **$1,500–5,000** + eng time | **$200–500** one-time |
| Legal / blocking risk | High (anti-bot, ToS, CF) | Medium (smaller site, robots restrictions) |
| Image hosting | Must mirror to R2; hotlinking brittle | Same |

**Infra sketch (if insisted):** queue workers → proxy pool → product URL list → HTML/JSON extract → normalize → `import-catalog.ts` → R2 image mirror → Postgres.

---

## Cost comparison: 100k Shein

| Method | Est. USD | Time to 100k | Legal posture |
|--------|----------|--------------|---------------|
| **Bright Data dataset** | **$250** (list min) | Hours (download + import) | Best — commercial license |
| **Apify (cheap actor)** | **~$500** | 1–3 days (rate limits) | Poor — still scraping Shein |
| **Apify (premium actor)** | **~$2,000** | 1–2 days | Poor |
| **Roll-your-own + proxies** | **$2,000–8,000** | Weeks (eng + maintenance) | Worst |

---

## Substitutes if “100k Newme” is non-negotiable

There is no honest substitute branded “Newme” at 100k. Closest **India Gen-Z fashion** volume plays:

1. **Myntra** — millions of SKUs; **no** bulk product API; affiliate deep links only (Cuelinks/Vcommission).
2. **Ajio** — large catalog; affiliate via networks.
3. **Bewakoof / Urbanic** — Gen-Z positioning, smaller than Myntra but bigger than Newme; partnership outreach.
4. **Flipkart Fashion + Amazon Fashion IN** — official affiliate APIs with images.
5. **Shein India section** — subset of global Shein dataset filtered by ship-to-IN or INR pricing.

**Pragmatic WORN target:** **100k Shein + 6k Newme + 50k affiliate-seeded India SKUs** ≈ 156k listings with honest sourcing.

---

## Import pipeline (implemented)

### File format

**JSONL** (preferred) — one object per line:

```json
{
  "title": "Shein Solid Ribbed Crop Top",
  "category": "Tops",
  "tags": ["trending", "crop"],
  "image_urls": ["https://img.shein.com/..."],
  "affiliate_url": "https://shein.com/...?utm_source=worn",
  "source": "shein",
  "coin_price": 32,
  "size": "S",
  "color": "Black"
}
```

**CSV** — pipe-delimited arrays for `tags` and `image_urls`:

```csv
title,category,tags,image_urls,affiliate_url,source,coin_price,size,color
Shein Crop Top,Tops,trending|crop,https://img.shein.com/a.jpg,https://shein.com/...,shein,32,S,Black
```

`source` must be `shein`, `newme`, `amazon`, `flipkart`, or `synthetic`. Optional: `coin_price`, `size`, `color`.

### Sample data

`apps/api/scripts/sample-catalog.jsonl` — 10 fake rows (5 Shein, 5 Newme).

### Commands

```bash
# Validate sample file (no DB writes)
pnpm --filter @worn/api import-catalog -- --file scripts/sample-catalog.jsonl --dry-run

# Import into Postgres (requires DATABASE_URL + migrations)
DATABASE_URL=postgres://... pnpm --filter @worn/api import-catalog -- --file /path/to/shein-100k.jsonl

# Cap batch size
pnpm --filter @worn/api import-catalog -- --file shein.jsonl --limit 1000
```

### Build 100k dataset (scrapers + merge)


> **Pagination note (Jun 2026):** Newme shop listing is Next.js CSR — plain `fetch` only returns page 1 products (~30) in `__NEXT_DATA__` even when `?page=N` is set. The scraper still walks shop pages for link discovery; **full ~9k catalog requires Playwright** (or a licensed feed). After a proof batch (`--limit 100`), re-run without `--limit` only after Playwright pagination is wired — otherwise you will re-scan duplicate pages.

> **Legal:** Scrapers are internal R&D tools with 2s rate limits. Output lives in `tmp/catalog/` (gitignored). Prefer Bright Data for Shein scale.

```bash
# 1. Newme full catalog (~5–6k SKUs, ~3–6h @ 2s/req)
pnpm --filter @worn/api scrape-newme

# Validate with a small batch first
pnpm --filter @worn/api scrape-newme -- --limit 20

# Resume overnight full catalog (~3–6h, auto-checkpoint every product)
pnpm --filter @worn/api scrape-newme

# 2. Shein Playwright attempt (likely blocked; writes failure report)
pnpm --filter @worn/api scrape-shein -- --limit 100

# 3. Merge sources + optional synthetic backfill to --target 100000
pnpm --filter @worn/api build-dataset

# Custom target / no synthetic padding
pnpm --filter @worn/api build-dataset -- --target 10000 --no-synthetic

# 4. Import merged file
pnpm --filter @worn/api import-catalog -- --file tmp/catalog/merged-100k.jsonl --dry-run
DATABASE_URL=postgres://... pnpm --filter @worn/api import-catalog -- --file tmp/catalog/merged-100k.jsonl
```

**Outputs:**

| File | Description |
|------|-------------|
| `tmp/catalog/newme.jsonl` | Newme scraper rows (~6k max) |
| `tmp/catalog/shein.jsonl` | Shein scraper rows (if any) |
| `tmp/catalog/merged-100k.jsonl` | Unified import-catalog JSONL |
| `tmp/catalog/manifest.json` | Honest source breakdown + gap to 100k |
| `tmp/catalog/*.checkpoint.json` | Resume state for scrapers |
| `tmp/catalog/shein-scrape-report.json` | Shein blockers + recommendation |

**Hitting 100k honestly:** Newme caps at ~6k. DIY Shein scrape is blocked (403). Add `tmp/catalog/shein.jsonl` from **Bright Data** (~$250/100k), plus optional `amazon.jsonl` / `flipkart.jsonl` from affiliate APIs, then re-run `build-dataset --no-synthetic`.

### What the importer does

1. Parses JSONL or CSV → Zod validation.
2. Maps each row to `ListingRecord` + one `ListingVariantRecord`.
3. Tags listings with `src:shein` or `src:newme`.
4. Assigns deterministic R2 key paths under `catalog/{source}/{hash}/{slug}/`.
5. Calls `repos.seedListings()` (Postgres if `DATABASE_URL` set, else in-memory).

### Post-import: images

The importer does **not** download images. After import:

1. Mirror each `image_urls[]` entry to the corresponding `productImageKeys` / `garmentImageKey` in R2.
2. Generate or queue house-model renders (FASHN pipeline) per listing.

---

## Suggested next steps (user decisions)

1. **Budget:** Approve **~$250** Bright Data purchase for 100k Shein rows, or **~$500** Apify path?
2. **Newme BD:** Email partnerships (FAQ: “Collaboration with NEWME”) for CSV/JSON product feed + affiliate terms?
3. **Legal:** Counsel review for in-app display of third-party product images (even from licensed datasets).
4. **Affiliate:** Apply for Flipkart Affiliate + Amazon Creators API to backfill India SKUs without scraping.
5. **Image mirror:** Build or buy a one-shot R2 mirroring job for imported `image_urls` (rate-limited, retryable).

---

## Scrape feasibility probes (R&D)

> **Legal disclaimer:** Probes below are **internal R&D only** — 1–2 rate-limited requests per site. They do not constitute permission to scrape. Production catalog ingestion requires legal review and licensed/affiliate paths where available.

### Run probes

```bash
# Install Playwright browser (first time only)
pnpm --filter @worn/api exec playwright install chromium

# Run all probes; writes JSON to tmp/scrape-probes/
pnpm --filter @worn/api scrape-probes
```

Scripts live in `apps/api/scripts/scrape-probes/`:

| Script | Target |
|--------|--------|
| `probe-newme.ts` | newme.asia shop page + 1 product |
| `probe-shein.ts` | shein.in search + product |
| `probe-myntra.ts` | Myntra women tops search |
| `probe-ajio.ts` | Ajio search |
| `probe-amazon-in.ts` | Amazon IN fashion search (prefer Creators API) |
| `probe-flipkart.ts` | Flipkart fashion search (prefer Affiliate API) |
| `run-all.ts` | Master runner + summary table |

Each probe writes `tmp/scrape-probes/{site}-result.json` with:

- `site`, `success`, `method` (`fetch` \| `playwright`), `latencyMs`
- `fieldsExtracted`: `{ title, price, images[], url }`
- `antiBotSignals`: `{ captcha, forbidden403, empty, blocked, cloudflare }`
- `error`, `catalogEstimate` (SKU hint + rough full-catalog time)

Successful probes also write `tmp/scrape-probes/{site}-catalog-sample.jsonl` (one import-catalog-shaped row).

### Probe results template (fill after run)

| Site | Feasible? | Method | Blockers | Est. full catalog | Recommended path |
|------|-----------|--------|----------|-------------------|------------------|
| **Newme** | **Yes** | fetch | — | ~3–6h for ~6k SKUs @ 1 req/2s | SSR shop HTML has product names + images; partnership feed still preferred |
| **Shein** | **No** | fetch → playwright | 403 / anti-bot; Playwright needed | Weeks DIY; hours via dataset | **Bright Data dataset (~$250/100k)** |
| **Myntra** | **No** | fetch | CSR listing grid; category URL only | Not viable at scale | Affiliate deep links (Cuelinks) |
| **Ajio** | **No** | fetch → playwright | React SPA; needs browser | Days+ with proxies | Affiliate networks |
| **Amazon IN** | **Partial** | fetch | Search page title only; use PA-API | Hours via API | **Amazon Creators / PA-API** |
| **Flipkart** | **Partial** | fetch | `unusual traffic` in HTML; page title generic | Hours via API | **Flipkart Affiliate API** |

_Last run: 2026-06-18 — from `tmp/scrape-probes/*-result.json`. Re-run after `pnpm --filter @worn/api scrape-probes` to refresh._

---

## References

- Prior WORN research: seller-upload + affiliate APIs ranked above scraping; bulk Myntra/Shein scrape = ToS violation.
- [Bright Data Shein Datasets](https://brightdata.com/products/datasets/shein) — 45.3M+ records, from $0.0025/record.
- [Newme shop](https://newme.asia/shop) — pagination confirms ~270 pages.
- Importer: `apps/api/scripts/import-catalog.ts`.
