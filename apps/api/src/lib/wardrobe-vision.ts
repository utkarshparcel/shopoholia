/**
 * WV04-AUTOTAG — pluggable vision tagger (mock filename/labels; optional hosted URL).
 */
import {
  autoTagWithDuplicateCheck,
  inferWardrobeAutoTag,
  mapLimit,
  type AutoTagWithDupes,
  type OwnedItemLike,
  type VisionAutoTag,
} from "@worn/shared";

export type VisionTagClient = {
  tag(input: {
    imageKey: string;
    labels?: string[];
    text?: string | null;
    /** Aborts the provider call (a batch deadline); the label heuristics answer instead. */
    signal?: AbortSignal;
  }): Promise<VisionAutoTag>;
};

/** One hosted vision call may take this long. */
export const VISION_TAG_TIMEOUT_MS = 10_000;
/** A whole batch (autotag, bulk, photo dump) waits on the provider this long at most. */
export const VISION_BATCH_BUDGET_MS = 30_000;
/** Provider calls in flight per batch. */
export const VISION_TAG_CONCURRENCY = 4;

/** Deterministic mock — parses imageKey / labels (no network). */
export class MockVisionTagClient implements VisionTagClient {
  async tag(input: {
    imageKey: string;
    labels?: string[];
    text?: string | null;
  }): Promise<VisionAutoTag> {
    return inferWardrobeAutoTag(input);
  }
}

export type HostedVisionTagConfig = {
  url?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
};

/**
 * Optional hosted vision tagger.
 * Expects JSON `{ labels?: string[], category?, colors?, brand?, confidence? }`.
 * Falls back to filename heuristics when the response is sparse.
 */
export class HostedVisionTagClient implements VisionTagClient {
  constructor(private readonly config: HostedVisionTagConfig = {}) {}

  async tag(input: {
    imageKey: string;
    labels?: string[];
    text?: string | null;
    signal?: AbortSignal;
  }): Promise<VisionAutoTag> {
    const url = this.config.url;
    if (!url) return inferWardrobeAutoTag(input);
    const fetchFn = this.config.fetchImpl ?? fetch;
    const timeout = AbortSignal.timeout(VISION_TAG_TIMEOUT_MS);
    try {
      const res = await fetchFn(url, {
        method: "POST",
        signal: input.signal ? AbortSignal.any([timeout, input.signal]) : timeout,
        headers: {
          "content-type": "application/json",
          ...(this.config.apiKey
            ? { authorization: `Bearer ${this.config.apiKey}` }
            : {}),
        },
        body: JSON.stringify({ imageKey: input.imageKey }),
      });
      if (!res.ok) return inferWardrobeAutoTag(input);
      const body = (await res.json()) as {
        labels?: string[];
        category?: string;
        colors?: string[];
        brand?: string | null;
        confidence?: number;
        text?: string;
      };
      const base = inferWardrobeAutoTag({
        imageKey: input.imageKey,
        labels: body.labels ?? input.labels,
        text: body.text ?? input.text,
      });
      return {
        category: body.category?.trim() || base.category,
        colors:
          Array.isArray(body.colors) && body.colors.length > 0
            ? body.colors.map(String)
            : base.colors,
        brand: body.brand !== undefined ? body.brand : base.brand,
        confidence:
          typeof body.confidence === "number"
            ? Math.min(1, Math.max(0, body.confidence))
            : base.confidence,
        sourceLabels: base.sourceLabels,
      };
    } catch {
      return inferWardrobeAutoTag(input);
    }
  }
}

export function createVisionTagClientFromEnv(
  env: Record<string, string | undefined> = process.env,
): VisionTagClient {
  if (env.VISION_TAG_PROVIDER === "mock") return new MockVisionTagClient();
  const url = env.VISION_TAG_URL;
  if (url) {
    return new HostedVisionTagClient({
      url,
      apiKey: env.VISION_TAG_API_KEY,
    });
  }
  return new MockVisionTagClient();
}

const PLACEHOLDER_CATEGORIES = new Set(["other", "untagged", "unknown", "item"]);

export function needsAutoTag(item: {
  category?: string;
  colors?: string[];
  brand?: string | null;
}): boolean {
  const cat = (item.category ?? "").trim().toLowerCase();
  if (!cat || PLACEHOLDER_CATEGORIES.has(cat)) return true;
  if (!item.colors?.length && !item.brand) return true;
  return false;
}

export async function tagImageWithDupes(
  client: VisionTagClient,
  input: {
    imageKey: string;
    labels?: string[];
    text?: string | null;
    titleHint?: string | null;
    signal?: AbortSignal;
  },
  owned: OwnedItemLike[],
): Promise<AutoTagWithDupes> {
  const vision = await client.tag({
    imageKey: input.imageKey,
    labels: input.labels,
    text: input.text,
    signal: input.signal,
  });
  return withDuplicateCheck(vision, input, owned);
}

/**
 * The provider calls for a batch, VISION_TAG_CONCURRENCY at a time, all under one
 * VISION_BATCH_BUDGET_MS deadline: a call still waiting then gets the label heuristics.
 * A null input stays null.
 */
export function tagBatch(
  client: VisionTagClient,
  inputs: Array<{ imageKey: string; labels?: string[]; text?: string | null } | null>,
): Promise<Array<VisionAutoTag | null>> {
  const deadline = AbortSignal.timeout(VISION_BATCH_BUDGET_MS);
  return mapLimit(inputs, VISION_TAG_CONCURRENCY, async (input) =>
    input ? client.tag({ ...input, signal: deadline }) : null,
  );
}

/**
 * Batch rows are checked against the rows before them under a placeholder id each (the item
 * doesn't exist yet); swap those for the created items' ids.
 */
export function resolvePlaceholderIds<W extends { matches: Array<{ wardrobeItemId: string }> }>(
  warnings: W[],
  ids: Map<string, string>,
): W[] {
  return warnings.map((w) => ({
    ...w,
    matches: w.matches.map((m) => ({ ...m, wardrobeItemId: ids.get(m.wardrobeItemId) ?? m.wardrobeItemId })),
  }));
}

/** The duplicate check for a tag the client already returned. Pure. */
export function withDuplicateCheck(
  vision: VisionAutoTag,
  input: { imageKey: string; text?: string | null; titleHint?: string | null },
  owned: OwnedItemLike[],
): AutoTagWithDupes {
  const checked = autoTagWithDuplicateCheck(
    {
      imageKey: input.imageKey,
      labels: vision.sourceLabels,
      text: input.text,
      titleHint:
        input.titleHint?.trim() || [vision.brand, vision.colors[0], vision.category].filter(Boolean).join(" "),
    },
    owned,
  );
  // The client's answer is the tag; the re-inference above is only for the duplicate check.
  return {
    ...checked,
    category: vision.category,
    colors: vision.colors,
    brand: vision.brand,
    confidence: vision.confidence,
    sourceLabels: vision.sourceLabels,
  };
}
