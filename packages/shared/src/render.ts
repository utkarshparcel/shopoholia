export type AvatarReferenceInput = {
  uploadKeys: string[];
};

export type AvatarReferenceResult = {
  /** The stored image every try-on uses as the model. May be one of the uploads itself. */
  referenceImageKey: string;
  bodyMeta: Record<string, unknown>;
  /** Bytes to store at `referenceImageKey`; absent when that key already holds the image. */
  imageBytes?: Uint8Array;
};

export type TryOnInput = {
  modelImageKey: string;
  garmentImageKey: string;
};

export type TryOnResult = {
  imageKey: string;
  costMicros: number;
  imageBytes?: Uint8Array;
};

export type RenderScenario =
  | "STUDIO"
  | "GOLDEN_HOUR"
  | "STREET"
  | "EDITORIAL_DARK"
  | "NIGHT"
  | "CANDID";

export const FREE_RENDER_SCENARIOS = ["STUDIO"] as const satisfies readonly RenderScenario[];

export const PAYWALLED_RENDER_SCENARIOS = [
  "GOLDEN_HOUR",
  "STREET",
  "EDITORIAL_DARK",
  "NIGHT",
  "CANDID",
] as const satisfies readonly RenderScenario[];

export type ScenarioPassInput = {
  tryOnImageKey: string;
  scenario: RenderScenario;
};

export type ScenarioPassResult = {
  /** The scene's image; the try-on's own key when the provider has no scene pass. */
  imageKey: string;
  costMicros: number;
  imageBytes?: Uint8Array;
};

/** Provider abstraction for FASHN / ComfyUI render pipelines. */
export interface RenderProvider {
  readonly name: string;
  createAvatarReference(input: AvatarReferenceInput): Promise<AvatarReferenceResult>;
  tryOn(input: TryOnInput): Promise<TryOnResult>;
  scenarioPass(input: ScenarioPassInput): Promise<ScenarioPassResult>;
}
