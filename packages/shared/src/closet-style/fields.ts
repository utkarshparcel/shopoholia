import type { StyleAttributes, StyleItem } from "./types.js";

/** Plan §8.1: a field the user didn't confirm counts at this confidence or more. Same value as the composer's. */
export const SHAPE_FIELD_MIN_CONFIDENCE = 0.8;

/** The shape fields the style rules read, all behind the gate (spec §4). */
export type ShapeField =
  | "silhouette"
  | "fit.waist"
  | "fit.hip"
  | "coverage.shoulders"
  | "coverage.underarms"
  | "coverage.midriff"
  | "coverage.back"
  | "coverage.legs"
  | "rise"
  | "length"
  | "volumeAt";

/** True when the user set or confirmed the field, or the model is confident enough. Mirrors the composer's `trusted`. */
export function trusted(item: StyleItem, field: ShapeField): boolean {
  const group = field.split(".")[0]!;
  const confirmed = item.attributesConfirmed;
  if (item.attributesSource === "USER" || confirmed[field] || confirmed[group]) return true;
  const confidence = item.attributes?.confidence ?? {};
  return (confidence[field] ?? confidence[group] ?? 0) >= SHAPE_FIELD_MIN_CONFIDENCE;
}

type ShapeValue<F extends ShapeField> = F extends `${infer G}.${infer K}`
  ? G extends "fit" | "coverage"
    ? K extends keyof StyleAttributes[G]
      ? StyleAttributes[G][K]
      : never
    : never
  : F extends keyof StyleAttributes
    ? StyleAttributes[F]
    : never;

/** The field's value when it is set and trusted, otherwise undefined. */
export function shape<F extends ShapeField>(item: StyleItem, field: F): ShapeValue<F> | undefined {
  const attrs = item.attributes;
  if (!attrs || !trusted(item, field)) return undefined;
  const [group, key] = field.split(".") as [string, string | undefined];
  const value = key === undefined
    ? (attrs as unknown as Record<string, unknown>)[group]
    : ((attrs as unknown as Record<string, Record<string, unknown>>)[group] ?? {})[key];
  return (value ?? undefined) as ShapeValue<F> | undefined;
}

/** The item's materials: the column, or the tagged list when the column is empty. */
export function materialsOf(item: StyleItem): readonly string[] {
  return item.materials.length > 0 ? item.materials : (item.attributes?.materials ?? []);
}
