/**
 * Care / wash-label OCR parsing (N20-CARE-OCR).
 * Turns free-text from a care-tag photo into structured laundry rules.
 */

import { z } from "zod";

export const CareWashSchema = z.enum([
  "machine_cold",
  "machine_warm",
  "machine_hot",
  "hand",
  "do_not_wash",
  "unknown",
]);
export type CareWash = z.infer<typeof CareWashSchema>;

export const CareBleachSchema = z.enum(["any", "non_chlorine", "do_not_bleach", "unknown"]);
export type CareBleach = z.infer<typeof CareBleachSchema>;

export const CareDrySchema = z.enum([
  "tumble_low",
  "tumble_hot",
  "line",
  "flat",
  "do_not_tumble",
  "unknown",
]);
export type CareDry = z.infer<typeof CareDrySchema>;

export const CareIronSchema = z.enum(["low", "medium", "high", "do_not_iron", "unknown"]);
export type CareIron = z.infer<typeof CareIronSchema>;

export const CareDryCleanSchema = z.enum(["ok", "petroleum", "do_not_dry_clean", "unknown"]);
export type CareDryClean = z.infer<typeof CareDryCleanSchema>;

export const CareRulesSchema = z.object({
  wash: CareWashSchema,
  bleach: CareBleachSchema,
  dry: CareDrySchema,
  iron: CareIronSchema,
  dryClean: CareDryCleanSchema,
  notes: z.array(z.string()).default([]),
  rawText: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});
export type CareRules = z.infer<typeof CareRulesSchema>;

/** Stored care rules as the API returns them: null when absent or not valid rules. */
export function careRulesOrNull(raw: unknown): CareRules | null {
  if (raw == null) return null;
  const parsed = CareRulesSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export const CareOcrBodySchema = z
  .object({
    /** R2 key of a care-tag photo (OCR'd server-side). */
    imageKey: z.string().min(1).optional(),
    /** Pre-extracted OCR text (tests / client-side OCR). */
    ocrText: z.string().min(1).optional(),
  })
  .refine((b) => Boolean(b.imageKey || b.ocrText), {
    message: "imageKey or ocrText required",
  });
export type CareOcrBody = z.infer<typeof CareOcrBodySchema>;

export const CareOcrResponseSchema = z.object({
  careRules: CareRulesSchema,
  confidence: z.number().min(0).max(1),
  rawText: z.string(),
  itemId: z.string().uuid(),
});
export type CareOcrResponse = z.infer<typeof CareOcrResponseSchema>;

function scoreConfidence(rules: Omit<CareRules, "notes" | "rawText" | "confidence">): number {
  const fields = [rules.wash, rules.bleach, rules.dry, rules.iron, rules.dryClean];
  const known = fields.filter((f) => f !== "unknown").length;
  return Math.min(0.98, 0.35 + known * 0.12);
}

/**
 * Parse wash-label / care-tag OCR text into structured rules.
 * Handles common EN symbols/phrases used on Indian & global apparel tags.
 */
export function parseCareLabel(ocrText: string): CareRules {
  const text = ocrText.replace(/\s+/g, " ").trim();
  const lower = text.toLowerCase();
  const notes: string[] = [];

  let wash: CareWash = "unknown";
  if (/\bdo\s*not\s*wash\b|\bno\s*wash\b/i.test(lower)) {
    wash = "do_not_wash";
  } else if (/\bhand\s*wash\b|\bwash\s*by\s*hand\b/i.test(lower)) {
    wash = "hand";
  } else if (/\b(90|95)\s*°?\s*c\b|\bmachine\s*wash\s*hot\b|\bwash\s*hot\b/i.test(lower)) {
    wash = "machine_hot";
  } else if (
    /\b(40|50|60)\s*°?\s*c\b|\bmachine\s*wash\s*warm\b|\bwarm\s*wash\b/i.test(lower)
  ) {
    wash = "machine_warm";
  } else if (
    /\b(30|20)\s*°?\s*c\b|\bmachine\s*wash\s*cold\b|\bcold\s*wash\b|\bmachine\s*wash\b/i.test(
      lower,
    )
  ) {
    wash = "machine_cold";
  }

  let bleach: CareBleach = "unknown";
  if (/\bdo\s*not\s*bleach\b|\bno\s*bleach\b/i.test(lower)) {
    bleach = "do_not_bleach";
  } else if (/\bnon[-\s]?chlorine\b|\boxygen\s*bleach\b/i.test(lower)) {
    bleach = "non_chlorine";
  } else if (/\bbleach\s*(when\s*)?needed\b|\bany\s*bleach\b/i.test(lower)) {
    bleach = "any";
  }

  let dry: CareDry = "unknown";
  if (/\bdo\s*not\s*tumble\b|\bno\s*tumble\b|\bdo\s*not\s*machine\s*dry\b/i.test(lower)) {
    dry = "do_not_tumble";
  } else if (/\btumble\s*dry\s*(high|hot)\b/i.test(lower)) {
    dry = "tumble_hot";
  } else if (/\btumble\s*dry(\s*low)?\b|\bdry\s*low\b/i.test(lower)) {
    dry = "tumble_low";
  } else if (/\bdry\s*flat\b|\blay\s*flat\b/i.test(lower)) {
    dry = "flat";
  } else if (/\bline\s*dry\b|\bhang\s*dry\b|\bdrip\s*dry\b/i.test(lower)) {
    dry = "line";
  }

  let iron: CareIron = "unknown";
  if (/\bdo\s*not\s*iron\b|\bno\s*iron\b/i.test(lower)) {
    iron = "do_not_iron";
  } else if (/\b(hot|high)\s*iron\b|\biron\s*(hot|high)\b/i.test(lower)) {
    iron = "high";
  } else if (/\b(warm|medium)\s*iron\b|\biron\s*(warm|medium)\b/i.test(lower)) {
    iron = "medium";
  } else if (/\b(cool|cold|low)\s*iron\b|\biron\s*(cool|cold|low)\b|\bcool\s*iron\b/i.test(lower)) {
    iron = "low";
  }

  let dryClean: CareDryClean = "unknown";
  if (/\bdo\s*not\s*dry\s*clean\b|\bno\s*dry\s*clean\b/i.test(lower)) {
    dryClean = "do_not_dry_clean";
  } else if (/\bpetroleum\b|\bP\s*solvent\b/i.test(lower)) {
    dryClean = "petroleum";
  } else if (/\bdry\s*clean\s*only\b|\bdry\s*clean\b|\bprofessional\s*clean\b/i.test(lower)) {
    dryClean = "ok";
  }

  if (/\b100%\s*cotton\b/i.test(lower)) notes.push("100% cotton");
  if (/\bwool\b/i.test(lower)) notes.push("wool");
  if (/\bsilk\b/i.test(lower)) notes.push("silk");
  if (/\bseparately\b/i.test(lower)) notes.push("wash separately");

  const confidence = scoreConfidence({ wash, bleach, dry, iron, dryClean });
  return CareRulesSchema.parse({
    wash,
    bleach,
    dry,
    iron,
    dryClean,
    notes,
    rawText: text || undefined,
    confidence,
  });
}

/** Pull plain text from OCR `raw` bags (hosted vision / mock care fixtures). */
export function extractOcrPlainText(
  raw: Record<string, unknown> | null | undefined,
  fallbackItems: Array<{ title?: string }> = [],
): string {
  if (raw) {
    if (typeof raw.text === "string" && raw.text.trim()) return raw.text.trim();
    if (typeof raw.fullText === "string" && raw.fullText.trim()) return raw.fullText.trim();
    if (Array.isArray(raw.lines)) {
      const joined = raw.lines.filter((l): l is string => typeof l === "string").join("\n");
      if (joined.trim()) return joined.trim();
    }
  }
  return fallbackItems
    .map((i) => i.title)
    .filter((t): t is string => Boolean(t))
    .join("\n");
}

const WASH_BADGE: Record<CareWash, string> = {
  machine_cold: "Cold wash",
  machine_warm: "Warm wash",
  machine_hot: "Hot wash",
  hand: "Hand wash",
  do_not_wash: "No wash",
  unknown: "Care",
};

/**
 * W061 — short badge label when careRules are present (tap expands elsewhere).
 */
export function careLabelBadge(rules: CareRules | null | undefined): string | null {
  if (!rules) return null;
  if (rules.dryClean === "ok" || rules.dryClean === "petroleum") return "Dry-clean";
  if (rules.wash !== "unknown") return WASH_BADGE[rules.wash];
  if (rules.dry === "do_not_tumble") return "Line dry";
  return "Care";
}

/** Expanded care line for badge tap / detail. */
export function formatCareRulesExpanded(rules: CareRules): string {
  return `Wash ${rules.wash} · Bleach ${rules.bleach} · Dry ${rules.dry} · Iron ${rules.iron} · Dry-clean ${rules.dryClean}`;
}
