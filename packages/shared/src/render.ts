export type AvatarReferenceInput = {
  uploadKeys: string[];
};

export type AvatarReferenceResult = {
  referenceImageKey: string;
  bodyMeta: Record<string, unknown>;
};

export type TryOnInput = {
  modelImageKey: string;
  garmentImageKey: string;
};

export type TryOnResult = {
  imageKey: string;
  costMicros: number;
};

export type RenderScenario =
  | "STUDIO"
  | "GOLDEN_HOUR"
  | "STREET"
  | "EDITORIAL_DARK"
  | "NIGHT"
  | "CANDID";

export const FREE_RENDER_SCENARIOS = ["STUDIO", "GOLDEN_HOUR"] as const satisfies readonly RenderScenario[];

export const PAYWALLED_RENDER_SCENARIOS = [
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
  imageKey: string;
  costMicros: number;
};

/** Provider abstraction for FASHN / ComfyUI render pipelines. */
export interface RenderProvider {
  readonly name: string;
  createAvatarReference(input: AvatarReferenceInput): Promise<AvatarReferenceResult>;
  tryOn(input: TryOnInput): Promise<TryOnResult>;
  scenarioPass(input: ScenarioPassInput): Promise<ScenarioPassResult>;
}
