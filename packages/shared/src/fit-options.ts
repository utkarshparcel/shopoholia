/**
 * Rich optionsSchema for Fit / Customization Vault (WV-06).
 * Supports legacy `string[]` groups and rich `{ label, options:[{value,label,imageKey,preview}] }`.
 */

export type FitOptionChoice = {
  value: string;
  label: string;
  imageKey?: string;
  preview?: string;
};

export type FitOptionGroup = {
  label: string;
  options: FitOptionChoice[];
};

export type ParsedOptionsSchema = Record<string, FitOptionGroup>;

export function slugifyFitOption(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function buildRichOptions(base: Record<string, string[]>): ParsedOptionsSchema {
  const out: ParsedOptionsSchema = {};
  for (const [key, values] of Object.entries(base)) {
    out[key] = {
      label: key.charAt(0).toUpperCase() + key.slice(1),
      options: values.map((v) => ({
        value: v,
        label: v,
        imageKey: `fit/${key}/${slugifyFitOption(v)}.jpg`,
        preview: `preview:${key}:${v}`,
      })),
    };
  }
  return out;
}

function isChoice(raw: unknown): raw is FitOptionChoice {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  return typeof o.value === "string" && typeof o.label === "string";
}

/**
 * Normalize template.optionsSchema into picker-ready groups with preview assets.
 * Legacy arrays become rich choices with derived imageKey/preview.
 */
export function parseOptionsSchema(raw: Record<string, unknown> | null | undefined): ParsedOptionsSchema {
  if (!raw || typeof raw !== "object") return {};
  const out: ParsedOptionsSchema = {};

  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      const options: FitOptionChoice[] = [];
      for (const item of value) {
        if (typeof item === "string") {
          options.push({
            value: item,
            label: item,
            imageKey: `fit/${key}/${slugifyFitOption(item)}.jpg`,
            preview: `preview:${key}:${item}`,
          });
        } else if (isChoice(item)) {
          options.push({
            value: item.value,
            label: item.label,
            imageKey:
              typeof item.imageKey === "string"
                ? item.imageKey
                : `fit/${key}/${slugifyFitOption(item.value)}.jpg`,
            preview:
              typeof item.preview === "string" ? item.preview : `preview:${key}:${item.value}`,
          });
        }
      }
      if (options.length > 0) {
        out[key] = {
          label: key.charAt(0).toUpperCase() + key.slice(1),
          options,
        };
      }
      continue;
    }

    if (value && typeof value === "object") {
      const group = value as Record<string, unknown>;
      const label =
        typeof group.label === "string"
          ? group.label
          : key.charAt(0).toUpperCase() + key.slice(1);
      const rawOptions = Array.isArray(group.options) ? group.options : [];
      const options: FitOptionChoice[] = [];
      for (const item of rawOptions) {
        if (typeof item === "string") {
          options.push({
            value: item,
            label: item,
            imageKey: `fit/${key}/${slugifyFitOption(item)}.jpg`,
            preview: `preview:${key}:${item}`,
          });
        } else if (isChoice(item)) {
          options.push({
            value: item.value,
            label: item.label,
            imageKey:
              typeof (item as FitOptionChoice).imageKey === "string"
                ? (item as FitOptionChoice).imageKey
                : `fit/${key}/${slugifyFitOption(item.value)}.jpg`,
            preview:
              typeof (item as FitOptionChoice).preview === "string"
                ? (item as FitOptionChoice).preview
                : `preview:${key}:${item.value}`,
          });
        }
      }
      if (options.length > 0) {
        out[key] = { label, options };
      }
    }
  }

  return out;
}

/** Default selections: first option in each group. */
export function defaultSelectionsFromSchema(
  schema: ParsedOptionsSchema,
): Record<string, string> {
  const selections: Record<string, string> = {};
  for (const [key, group] of Object.entries(schema)) {
    const first = group.options[0];
    if (first) selections[key] = first.value;
  }
  return selections;
}

/** Resolve a garment imageKey for avatar preview from selections + schema. */
export function garmentKeyForSelections(
  schema: ParsedOptionsSchema,
  selections: Record<string, string>,
): string | null {
  for (const [key, value] of Object.entries(selections)) {
    const group = schema[key];
    if (!group) continue;
    const choice = group.options.find((o) => o.value === value);
    if (choice?.imageKey) return choice.imageKey;
  }
  const firstGroup = Object.values(schema)[0];
  return firstGroup?.options[0]?.imageKey ?? null;
}
