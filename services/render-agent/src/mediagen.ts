import { readFile, writeFile } from "node:fs/promises";
import jpeg from "jpeg-js";
import { decodeImage, sniffFormat } from "./quality.js";

/**
 * The render engine: the local mediagen HTTP server (127.0.0.1:8199, backed by mlx-serve with
 * mage-edit), which edits the person in the model photo into the garment while keeping face,
 * hair and pose.
 *
 * ┌───────────────────────────────────────────────────────────────────────────────────────────┐
 * │ STUB. mediagen's HTTP API is not documented in this repo, so nothing here calls it yet.    │
 * │ `createMediagenEngine` throws MediagenNotConfiguredError until someone fills in:           │
 * │   1. the endpoint(s): path, method, and whether a job is synchronous or polled;            │
 * │   2. the request format: how the model photo and garment photo(s) are sent (multipart,      │
 * │      file paths, base64), and the model name / steps / seed / size parameters;             │
 * │   3. the response: where the output image comes from (bytes, a path, or a URL to fetch);    │
 * │   4. clean-up: the call that clears mediagen's own inputs and outputs after each job       │
 * │      (the plan names `/api/clear`; confirm it), so no copy is left on the Mac;              │
 * │   5. the scenario prompts below, tuned on real renders.                                     │
 * │ Do not guess these: every endpoint below is a TODO, none is presented as real.             │
 * └───────────────────────────────────────────────────────────────────────────────────────────┘
 */

export type RenderScenario = "STUDIO" | "GOLDEN_HOUR" | "STREET" | "EDITORIAL_DARK" | "NIGHT" | "CANDID";

export type EditTryOnInput = {
  /** The person's photo (the avatar, or a house model), on local disk. */
  modelImagePath: string;
  /** The garments to dress, in order (more than one for a combined look). */
  garmentImagePaths: string[];
  /** The scene; null for a plain try-on preview. */
  scenario: RenderScenario | null;
  /** Where to write the finished JPEG. */
  outputPath: string;
};

export interface RenderEngine {
  /** False for the stub: the agent then refuses to lease work it can't do. */
  readonly configured: boolean;
  editTryOn(input: EditTryOnInput): Promise<void>;
}

/** mediagen has not been wired up yet (see the box above). The agent leases nothing until it is. */
export class MediagenNotConfiguredError extends Error {
  constructor(mediagenUrl: string) {
    super(
      `The mediagen adapter is a stub (services/render-agent/src/mediagen.ts). Fill in mediagen's ` +
        `endpoint at ${mediagenUrl}, its request format (model photo, garment photos, prompt, seed, steps), ` +
        `how the output image comes back, its clean-up call, and the scenario prompts. ` +
        `Until then run the agent with --dry-run to test the loop.`,
    );
    this.name = "MediagenNotConfiguredError";
  }
}

/** A render that can't succeed on another attempt (an unreadable input, a refused prompt). */
export class RenderRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RenderRejectedError";
  }
}

/** What every scene must keep: the person and the garment are the truth, the scene is not. */
const PRESERVE =
  "Keep the person's face, identity, skin tone, hair and body pose exactly as in the photo. " +
  "Dress them in the garment exactly as shown: same colour, pattern, fabric, cut, length and details. " +
  "Do not add or remove accessories, text or logos.";

/**
 * A starting point for each scene's prompt (the six reveal scenes), plus the plain try-on.
 * TODO: tune against real mage-edit renders; the wording here is untested.
 */
export const SCENARIO_PROMPTS: Record<RenderScenario | "TRYON", string> = {
  TRYON: `Photo of the same person wearing the garment, same background and framing. ${PRESERVE}`,
  STUDIO: `Clean fashion studio photo: seamless warm-white backdrop, soft even key light, full body. ${PRESERVE}`,
  GOLDEN_HOUR: `Outdoors at golden hour: low warm sunlight, soft long shadows, gentle lens flare. ${PRESERVE}`,
  STREET: `Street-style photo in a city: daytime, shopfronts and pavement softly out of focus. ${PRESERVE}`,
  EDITORIAL_DARK: `Moody editorial photo: dark backdrop, single hard key light, deep shadows, high contrast. ${PRESERVE}`,
  NIGHT: `City at night: neon signs, wet street reflections, cool light with warm accents. ${PRESERVE}`,
  CANDID: `Candid lifestyle photo: natural mid-movement moment, relaxed expression, soft daylight indoors. ${PRESERVE}`,
};

export function promptFor(scenario: RenderScenario | null): string {
  return SCENARIO_PROMPTS[scenario ?? "TRYON"];
}

/**
 * The mediagen engine. STUB: throws MediagenNotConfiguredError (see the box at the top).
 */
export function createMediagenEngine(mediagenUrl: string): RenderEngine {
  return {
    configured: false,
    async editTryOn(input) {
      // TODO(mediagen): replace with the real call, for example:
      //   1. send input.modelImagePath and input.garmentImagePaths with promptFor(input.scenario)
      //      to mediagen at `mediagenUrl` (endpoint and format: unknown, fill in);
      //   2. wait for the result (synchronous or polled: unknown, fill in);
      //   3. write the output JPEG to input.outputPath;
      //   4. clear mediagen's copies of the inputs and output (its clean-up call: unknown).
      // Throw RenderRejectedError for a refusal that can't pass on retry (unreadable image,
      // safety refusal); any other error is retried.
      void input;
      throw new MediagenNotConfiguredError(mediagenUrl);
    },
  };
}

/**
 * --dry-run: "renders" the model photo mirrored left to right, as a JPEG, to test the whole loop
 * end to end. Mirrored, not copied, so it passes the quality checks like a real render.
 */
export function createDryRunEngine(): RenderEngine {
  return {
    configured: true,
    async editTryOn({ modelImagePath, outputPath }) {
      const bytes = new Uint8Array(await readFile(modelImagePath));
      const format = sniffFormat(bytes);
      if (!format) throw new RenderRejectedError("The model photo is not a JPEG or PNG");
      const image = decodeImage(bytes, format);
      const mirrored = new Uint8Array(image.data.length);
      for (let y = 0; y < image.height; y += 1) {
        for (let x = 0; x < image.width; x += 1) {
          const from = (y * image.width + x) * 4;
          const to = (y * image.width + (image.width - 1 - x)) * 4;
          mirrored.set(image.data.subarray(from, from + 4), to);
        }
      }
      const output = jpeg.encode({ width: image.width, height: image.height, data: mirrored }, 90);
      await writeFile(outputPath, output.data, { mode: 0o600 });
    },
  };
}
