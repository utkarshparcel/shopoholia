import type { RenderProvider } from "@worn/shared";
import { createFashnClient, creditsToMicros, type FashnFetch } from "./fashn-client.js";

const TRYON_COST_MICROS = 50_000;
const SCENARIO_COST_MICROS = 120_000;

export type RenderProviderDeps = {
  apiKey?: string;
  /** Signs a storage key into a URL FASHN can fetch. Absolute http(s) URLs are sent as they are. */
  resolveImage?: (key: string) => Promise<string>;
  fetchImpl?: FashnFetch;
};

/** No live try-on provider is configured (production without FASHN_API_KEY). */
export class RenderUnavailableError extends Error {
  readonly statusCode = 503;
  readonly code = "tryon_unavailable";

  constructor(message = "Try-on rendering is not configured") {
    super(message);
    this.name = "RenderUnavailableError";
  }
}

export function createMockRenderProvider(): RenderProvider {
  return {
    name: "mock-fashn",
    async createAvatarReference({ uploadKeys }) {
      const primary = uploadKeys[0] ?? "uploads/unknown";
      return {
        referenceImageKey: primary.replace(/^uploads\//, "references/"),
        bodyMeta: { provider: "mock-fashn", normalized: true },
        imageBytes: new Uint8Array(Buffer.from("mock-avatar-reference")),
      };
    },
    async tryOn({ modelImageKey, garmentImageKey }) {
      return {
        imageKey: `tryon/${modelImageKey}__${garmentImageKey}.jpg`,
        costMicros: TRYON_COST_MICROS,
        imageBytes: new Uint8Array(Buffer.from(`mock-tryon:${modelImageKey}`)),
      };
    },
    async scenarioPass({ tryOnImageKey, scenario }) {
      return {
        imageKey: `reveal/${scenario.toLowerCase()}/${tryOnImageKey}`,
        costMicros: SCENARIO_COST_MICROS,
        imageBytes: new Uint8Array(Buffer.from(`mock-reveal:${scenario}`)),
      };
    },
  };
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * The avatar reference is the user's first uploaded photo, kept where it was stored. There is no
 * normalisation step (FASHN's try-on takes the photo as it is), so its bytes are never rewritten.
 */
function uploadedPhotoReference(provider: string): RenderProvider["createAvatarReference"] {
  return async ({ uploadKeys }) => {
    const primary = uploadKeys[0];
    if (!primary) throw new Error("An avatar needs at least one uploaded photo");
    return {
      referenceImageKey: primary,
      bodyMeta: { provider, source: "upload", normalized: false },
    };
  };
}

/**
 * The FASHN client has no scene endpoint (only tryon-max), so a scene is the try-on image
 * itself: a real render, never a placeholder, at no extra cost.
 */
const tryOnAsScene: RenderProvider["scenarioPass"] = async ({ tryOnImageKey }) => ({
  imageKey: tryOnImageKey,
  costMicros: 0,
});

export function createFashnRenderProvider(
  apiKey?: string,
  deps: Pick<RenderProviderDeps, "resolveImage" | "fetchImpl"> = {},
): RenderProvider {
  if (!apiKey) {
    return createMockRenderProvider();
  }

  const client = createFashnClient({ apiKey, fetchImpl: deps.fetchImpl });

  return {
    name: "fashn",
    createAvatarReference: uploadedPhotoReference("fashn"),
    async tryOn({ modelImageKey, garmentImageKey }) {
      const resolve = deps.resolveImage;
      if (!resolve) {
        throw new Error(
          "FASHN provider requires resolveImage to map storage keys to image URLs or base64",
        );
      }
      // Catalog images are often full URLs already; only storage keys are signed.
      const imageUrl = (key: string) => (isHttpUrl(key) ? Promise.resolve(key) : resolve(key));

      const [modelImage, productImage] = await Promise.all([
        imageUrl(modelImageKey),
        imageUrl(garmentImageKey),
      ]);

      const fashnResult = await client.tryOnMax({ modelImage, productImage });
      // The render is only usable once its bytes are ours: a failed download fails the try-on.
      const imageBytes = await client.downloadFromUrl(fashnResult.outputUrl);

      return {
        imageKey: `tryon/fashn/${fashnResult.predictionId}.jpg`,
        costMicros: creditsToMicros(fashnResult.creditsUsed),
        imageBytes,
      };
    },
    scenarioPass: tryOnAsScene,
  };
}

/**
 * Production without a key: try-on throws RenderUnavailableError instead of returning mock
 * images. Avatars still keep the user's real photo, and no scene is ever a mock image.
 */
export function createUnavailableRenderProvider(): RenderProvider {
  return {
    name: "unavailable",
    createAvatarReference: uploadedPhotoReference("unavailable"),
    async tryOn() {
      throw new RenderUnavailableError();
    },
    scenarioPass: tryOnAsScene,
  };
}

/** Whether try-on can render: false only for the production provider without a key. */
export function renderProviderAvailable(provider: RenderProvider): boolean {
  return provider.name !== "unavailable";
}

/** Factory used by API deps — picks live FASHN when FASHN_API_KEY is set. */
export function createRenderProvider(deps: RenderProviderDeps = {}): RenderProvider {
  const apiKey = deps.apiKey ?? process.env.FASHN_API_KEY;
  if (!apiKey && process.env.NODE_ENV === "production") return createUnavailableRenderProvider();
  return createFashnRenderProvider(apiKey, deps);
}
