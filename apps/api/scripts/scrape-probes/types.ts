/**
 * LEGAL DISCLAIMER — R&D FEASIBILITY PROBES ONLY
 *
 * These scripts perform minimal, rate-limited requests to third-party e-commerce
 * sites for internal technical feasibility assessment. They are NOT production
 * scrapers. Bulk scraping may violate site Terms of Service and applicable law.
 * Obtain legal counsel before any production catalog ingestion.
 *
 * Do NOT commit scraped images or large HTML dumps to the repository.
 */

export type ProbeMethod = "fetch" | "playwright";

export type AntiBotSignals = {
  captcha: boolean;
  forbidden403: boolean;
  empty: boolean;
  blocked: boolean;
  cloudflare: boolean;
};

export type FieldsExtracted = {
  title?: string;
  price?: string;
  images: string[];
  url?: string;
};

export type ProbeResult = {
  site: string;
  success: boolean;
  method: ProbeMethod;
  latencyMs: number;
  fieldsExtracted: FieldsExtracted;
  error?: string;
  antiBotSignals: AntiBotSignals;
  catalogEstimate?: {
    skuCountHint?: string;
    fullCatalogHours?: string;
    notes?: string;
  };
};

export type CatalogSampleRow = {
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

export type ProbeFn = () => Promise<ProbeResult>;
