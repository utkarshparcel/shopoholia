/**
 * Fit vault option pickers (WV06-OPTIONS-UI) — parse template.optionsSchema for UI.
 */
import {
  defaultSelectionsFromSchema,
  parseOptionsSchema,
  type FitOptionGroup,
  type ParsedOptionsSchema,
} from '@worn/shared';

export type { FitOptionGroup, ParsedOptionsSchema };

export function parseTemplateOptions(raw: Record<string, unknown> | null | undefined): ParsedOptionsSchema {
  return parseOptionsSchema(raw ?? {});
}

export function initialSelections(schema: ParsedOptionsSchema): Record<string, string> {
  return defaultSelectionsFromSchema(schema);
}

/** Flat list of option groups for rendering pickers. */
export function optionGroups(schema: ParsedOptionsSchema): Array<{ key: string; group: FitOptionGroup }> {
  return Object.entries(schema).map(([key, group]) => ({ key, group }));
}

export function selectionSummary(selections: Record<string, string>): string {
  return Object.entries(selections)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ');
}
