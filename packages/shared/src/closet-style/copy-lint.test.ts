/**
 * The copy lint (spec §10.3): garments are the subject, never bodies.
 * It runs over every template the style engine renders, through `ALL_TEMPLATE_SAMPLES()`.
 * It is stricter than the two lists it reads: it also catches inflections, plurals, a few
 * near-synonyms, and odd spacing or hyphen characters.
 */
import { describe, expect, it } from "vitest";
import { ALL_TEMPLATE_SAMPLES, BANNED_WORDS, BODY_PARTS } from "./notes.js";

/** Lint data: forms and near-synonyms of the banned list that the suffix rule below can't reach. */
const EXTRA_BANNED = [
  "hid",
  "hiding",
  "hidden",
  "flatter",
  "flatters",
  "flattery",
  "slimmer",
  "slimmest",
  "slender",
  "thinner",
  "skinnier",
  "fat",
  "fatter",
  "chubby",
  "curvy",
  "body type",
  "body shape",
  "weight",
  "conceal",
  "disguise",
  "minimise",
  "minimize",
  "trouble spot",
  "trouble zone",
];

/** Lint data: more words for parts of the body, checked under the same placement rule. */
const EXTRA_BODY_WORDS = ["torso", "bum", "butt", "booty", "bosom", "waistline", "hipline", "bustline"];

/** The only words that may come before "the <part>". */
const PLACEMENTS = ["at", "from", "to", "over", "below", "above", "on", "around", "through", "past", "across"];

const BANNED_SUFFIX = "(?:s|es|d|ed|ing|less)?";
const L = "[\\p{L}\\p{N}]";

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Lowercase, and fold typographic quotes, dashes, spaces and zero-width characters to plain ones. */
function normalise(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, "")
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/gu, " ")
    .toLowerCase();
}

/** Every inflection the lint treats as the same part: waist, waists; belly, bellies. */
function partForms(parts: readonly string[]): string[] {
  const forms = new Set<string>();
  for (const part of parts) {
    forms.add(part);
    forms.add(`${part}s`);
    forms.add(`${part}es`);
    if (part.endsWith("y")) forms.add(`${part.slice(0, -1)}ies`);
  }
  return [...forms].sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
}

const PART_FORMS = partForms([...BODY_PARTS, ...EXTRA_BODY_WORDS]);
const PARTS = PART_FORMS.map(escape).join("|");

const BANNED_RES = [...BANNED_WORDS, ...EXTRA_BANNED].map((word) => ({
  word,
  re: new RegExp(`(?<!${L})${word.split(/[ -]+/).map(escape).join("[ -]?")}${BANNED_SUFFIX}(?!${L})`, "iu"),
}));

const PART_RE = new RegExp(`(?<!${L})(?:${PARTS})(?!${L})`, "giu");
const PLACED_RE = new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${PLACEMENTS.join("|")}) the $`, "u");
const YOUR_PART_RE = new RegExp(`(?<!${L})your(?: [\\p{L}'-]+){0,2}? (?:${PARTS})(?!${L})`, "iu");

/** Hyphenated garment compounds that may carry a part's name. Nothing else hyphenated may. */
const GARMENT_COMPOUNDS = [
  new RegExp(`(?<!${L})(?:wide|straight|slim|skinny|flared|tapered|bootcut|cropped|full)-leg(?:s|ged)?(?!${L})`, "gu"),
  new RegExp(`(?<!${L})(?:off|one|cold|drop|dropped)-(?:the-)?shoulders?(?:ed)?(?!${L})`, "gu"),
  new RegExp(`(?<!${L})(?:high|mid|low|drop|dropped|empire|elastic|elasticated)-waist(?:ed)?(?!${L})`, "gu"),
  new RegExp(`(?<!${L})(?:${PARTS})-length(?!${L})`, "gu"),
];

function compoundSpans(text: string): [number, number][] {
  const spans: [number, number][] = [];
  for (const re of GARMENT_COMPOUNDS) {
    for (const m of text.matchAll(re)) spans.push([m.index, m.index + m[0].length]);
  }
  return spans;
}

/** Why a line fails the copy rules; empty when it passes. */
function lint(raw: string): string[] {
  const text = normalise(raw);
  const findings: string[] = [];
  for (const { word, re } of BANNED_RES) {
    if (re.test(text)) findings.push(`banned word "${word}"`);
  }
  if (YOUR_PART_RE.test(text)) findings.push("names the reader's body");
  const spans = compoundSpans(text);
  for (const m of text.matchAll(PART_RE)) {
    const start = m.index;
    const end = start + m[0].length;
    const inCompound = spans.some(([a, b]) => start >= a && end <= b);
    if (inCompound) continue;
    if (PLACED_RE.test(text.slice(0, start))) continue;
    findings.push(`"${m[0]}" is not placed as where a garment sits`);
  }
  return findings;
}

describe("copy lint", () => {
  it("copy lint passes on every template", () => {
    const samples = ALL_TEMPLATE_SAMPLES();
    expect(samples.length).toBeGreaterThan(1000);
    const failures = samples.map((line) => ({ line, findings: lint(line) })).filter((r) => r.findings.length > 0);
    expect(failures).toEqual([]);
  });

  it("copy lint catches offenders", () => {
    const offenders = [
      "slimming",
      "flatters your hips",
      "Your waist looks",
      "hide the tummy",
      "A flattering wrap.",
      "A FLATTERING fit.",
      "Unflattering on you.",
      "Covers every flaw.",
      "Flawless.",
      "Hides the middle.",
      "Hiding the belly.",
      "Skips the problem areas.",
      "Great for a pear shape.",
      "Made for apples.",
      "An hourglass cut.",
      "Rectangle friendly.",
      "Suits an inverted triangle.",
      "Plus-size friendly.",
      "plus size",
      "Plus\u2011size.",
      "Camouflages the middle.",
      "Shows off your figure.",
      "Figure-hugging jersey.",
      "Makes you look slimmer.",
      "Kind to curvy shapes.",
      "The waist is defined.",
      "Waists look smaller.",
      "Arms stay covered.",
      "Legs look longer.",
      "Draws the eye to your bust.",
      "Skims your curves.",
      "Kind to your little tummy.",
      "Perfect for your stomach.",
      "Body-hugging jersey.",
      "It slims the thighs.",
      "Ties at your waist.",
      "Sits at her hips.",
      "A shorter torso.",
      "Lifts the bum.",
      "Good for your frame.",
      "Your body, your rules.",
    ];
    const missed = offenders.filter((line) => lint(line).length === 0);
    expect(missed).toEqual([]);
  });

  it("copy lint allows a garment placed on the body", () => {
    const fine = [
      "The wrap ties at the waist.",
      "Loose through the body.",
      "It falls straight from the shoulder.",
      "The off-shoulder neckline opens at the shoulders.",
      "An off-the-shoulder top.",
      "Wide-leg trousers in linen.",
      "A straight-leg jean.",
      "A high-waist skirt.",
      "A thigh-length hem.",
      "Sits on the hips, in a soft cotton.",
      "A pineapple print.",
      "A bodycon dress.",
      "Covered through the middle.",
    ];
    expect(fine.map((line) => ({ line, findings: lint(line) })).filter((r) => r.findings.length > 0)).toEqual([]);
  });

  it("reads the spec's lists", () => {
    expect([...BANNED_WORDS].sort()).toEqual(
      [
        "flattering",
        "unflattering",
        "slimming",
        "hide",
        "flaw",
        "problem area",
        "figure",
        "apple",
        "pear",
        "hourglass",
        "rectangle",
        "inverted triangle",
        "plus-size",
        "camouflage",
      ].sort(),
    );
    expect([...BODY_PARTS].sort()).toEqual(
      [
        "waist",
        "hip",
        "hips",
        "bust",
        "chest",
        "shoulder",
        "shoulders",
        "arm",
        "arms",
        "leg",
        "legs",
        "thigh",
        "thighs",
        "stomach",
        "tummy",
        "belly",
        "midriff",
        "body",
        "curves",
        "frame",
      ].sort(),
    );
  });

  it("every sample renders cleanly, with no placeholder or raw value", () => {
    const broken = ALL_TEMPLATE_SAMPLES().filter(
      (line) =>
        line !== line.trim() ||
        /\bundefined\b|\bNaN\b|\bnull\b|\[object|_|\$\{|\s{2}|\s[.,;]|\ban [bcdfghjklmnpqrstvwxyz]/i.test(line) ||
        /\ba [aeiou]/i.test(line.replace(/\ba one-/gi, "")),
    );
    expect(broken).toEqual([]);
  });
});
