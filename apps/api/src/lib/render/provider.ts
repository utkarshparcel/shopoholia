import type { RenderProvider } from "@worn/shared";
import { createFashnClient, creditsToMicros, type FashnFetch } from "./fashn-client.js";

const TRYON_COST_MICROS = 50_000;
const SCENARIO_COST_MICROS = 120_000;

export type RenderProviderDeps = {
  apiKey?: string;
  resolveImage?: (key: string) => Promise<string>;
  fetchImpl?: FashnFetch;
  downloadImage?: (url: string) => Promise<Uint8Array>;
};

export function createMockRenderProvider(): RenderProvider {
  return {
    name: "mock-fashn",
    async createAvatarReference({ uploadKeys }) {
      const primary = uploadKeys[0] ?? "uploads/unknown";
      return {
        referenceImageKey: primary.replace(/^uploads\//, "references/"),
        bodyMeta: { provider: "mock-fashn", normalized: true },
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

export function createFashnRenderProvider(
  apiKey?: string,
  deps: Pick<RenderProviderDeps, "resolveImage" | "fetchImpl" | "downloadImage"> = {},
): RenderProvider {
  if (!apiKey) {
    return createMockRenderProvider();
  }

  const client = createFashnClient({ apiKey, fetchImpl: deps.fetchImpl });
  const mock = createMockRenderProvider();

  return {
    name: "fashn",
    createAvatarReference: (input) => mock.createAvatarReference(input),
    async tryOn({ modelImageKey, garmentImageKey }) {
      const resolve = deps.resolveImage;
      if (!resolve) {
        throw new Error(
          "FASHN provider requires resolveImage to map storage keys to image URLs or base64",
        );
      }

      const [modelImage, productImage] = await Promise.all([
        resolve(modelImageKey),
        resolve(garmentImageKey),
      ]);

      const fashnResult = await client.tryOnMax({ modelImage, productImage });
      let imageBytes: Uint8Array | undefined;
      try {
        imageBytes = await client.downloadFromUrl(fashnResult.outputUrl);
      } catch {
        // Fall through — try-on still returns a remote key without local bytes.
      }

      return {
        imageKey: `tryon/fashn/${fashnResult.predictionId}.jpg`,
        costMicros: creditsToMicros(fashnResult.creditsUsed),
        imageBytes,
      };
    },
    async scenarioPass(input) {
      const download = deps.downloadImage;
      if (download) {
        try {
          const result = await mock.scenarioPass(input);
          let imageBytes: Uint8Array | undefined;

          if (input.tryOnImageKey.startsWith('tryon/fashn/')) {
            const baseUrl = 'https://cdn.fashn.ai';
            const url = `${baseUrl}/${input.tryOnImageKey.replace(/^tryon\/fashn\//, '')}`;
            imageBytes = await download(url);
          }

          return { ...result, imageBytes };
        } catch {
          // Fall back to mock scenario when CDN download fails.
        }
      }
      return mock.scenarioPass(input);
    },
  };
}

/** Factory used by API deps — picks live FASHN when FASHN_API_KEY is set. */
export function createRenderProvider(deps: RenderProviderDeps = {}): RenderProvider {
  const apiKey = deps.apiKey ?? process.env.FASHN_API_KEY;
  return createFashnRenderProvider(apiKey, deps);
}
