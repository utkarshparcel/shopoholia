/**
 * WV04-AUTOTAG — pluggable vision tagger (mock filename/labels; optional hosted URL).
 */
import {
  autoTagWithDuplicateCheck,
  inferWardrobeAutoTag,
  type AutoTagWithDupes,
  type OwnedItemLike,
  type VisionAutoTag,
} from "@worn/shared";

export type VisionTagClient = {
  tag(input: {
    imageKey: string;
    labels?: string[];
    text?: string | null;
  }): Promise<VisionAutoTag>;
};

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
  }): Promise<VisionAutoTag> {
    const url = this.config.url;
    if (!url) return inferWardrobeAutoTag(input);
    const fetchFn = this.config.fetchImpl ?? fetch;
    try {
      const res = await fetchFn(url, {
        method: "POST",
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
  },
  owned: OwnedItemLike[],
): Promise<AutoTagWithDupes> {
  const vision = await client.tag({
    imageKey: input.imageKey,
    labels: input.labels,
    text: input.text,
  });
  return autoTagWithDuplicateCheck(
    {
      imageKey: input.imageKey,
      labels: vision.sourceLabels,
      text: input.text,
      titleHint: input.titleHint,
    },
    owned,
  );
}
