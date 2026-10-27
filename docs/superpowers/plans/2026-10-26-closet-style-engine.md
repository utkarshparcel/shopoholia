# Closet style engine — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rank each week's looks by the user's likes, proportions, closet colours and fabric against the day; explain them in words about the clothes; and list what the closet is missing.

**Architecture:** The pure engine lives in `packages/shared/src/closet-style/` and has no I/O, clock or randomness. The composer calls it for piece and look terms. The API stores the profile, measurements, events and gap dismissals, and runs the weekly learning step. The mobile app adds the "You" step, the style read, Your style and Gaps. A local Expo module measures the optional photo on the phone.

**Tech Stack:** TypeScript (NodeNext, strict), zod 3, vitest 3, Drizzle (Postgres), Fastify, BullMQ 5.81.3, Expo SDK 56 / RN 0.85.3 / expo-router, Expo Modules API, MediaPipe Tasks Vision.

**Spec:** `docs/superpowers/specs/2026-10-26-closet-style-engine-design.md`. Executors read the spec and this plan. "§n" means a spec section and "plan §n" means `docs/CLOSET_IMPLEMENTATION_PLAN.md`.

## Global Constraints

- The engine stays pure: no `Date.now()`, `Math.random()`, I/O or env reads in `closet-style/`. Dates come in as `YYYY-MM-DD` strings.
- The same input gives the same output. Sorting always ends with a stable key (id or key string).
- Rank, never remove. Style terms never change which looks pass the hard constraints (§2.3).
- Likes beat proportions. When a like and a proportion rule push the same axis in opposite directions, the proportion rule contributes 0 on that axis (§5.1).
- Every shape field the rules read (silhouette, fit, coverage, rise, length, volumeAt) goes through `trusted`/`shape` in `fields.ts`. The gate is 0.8, or confirmed, or `attributesSource === "USER"`.
- No raw cm in `style_profiles`, the composer input, analytics, logs or error reports. Only buckets reach the composer (§3.2, §10.2).
- Copy: banned words are flattering, unflattering, slimming, hide, flaw, problem area, figure, apple, pear, hourglass, rectangle, inverted triangle, plus-size and camouflage. A body part appears only as where a garment sits ("at the waist") (§10.3).
- Gaps never carry shop links, brands or prices (§6.3).
- Every number in the rules is a starting value. Keep each one in an exported constant so the stylist can tune them in one place.
- Starting weights: `likes` 1.0, `proportion` 0.5, `palette` 0.5, `fabric` 0.6 (§5.1).
- Budgets (targets, measured): the style terms add 50 ms or less to the composer's 300 ms for 300 pieces. Gaps take 500 ms or less. The photo measure takes 2 s or less on a mid-range Android phone.
- Repo rules (agents' `common.md`):
  - Never commit, push, stash, reset or check out. Each task ends by producing a patch.
  - Installs are offline only, and nothing is downloaded without the owner's OK.
  - Use the private Postgres on 54329 and a private Redis only.
  - Match the surrounding code. No Prettier runs. Use straight `'` in mobile strings. Never add `eslint-disable … react-hooks`.

## Review Focus

1. **An item with no hex, a malformed hex, or an empty colour list.** The colour terms fall back to the colour name, or score 0, and never throw. *Owner: Task A1, test `harmony falls back to names when a hex is missing or malformed`.*
2. **Materials typed in free form** ("60% Cotton", "Art-Silk", "cotton/poly", "") and blends that start with an unknown material. They map to a canonical material or to unknown, never to a guess. *Owner: Task A2, test `canonicalMaterial normalises free text`.*
3. **Measurements that are missing, zero, NaN or implausible** (a waist of 0, a hip of 500 cm, height in inches by mistake). That bucket is unknown, and no other bucket changes. *Owner: Task A2, test `proportions ignore implausible numbers`.*
4. **A new user: no tagged pieces, no wears, no profile.** The style read, gaps and composer still return honest, non-empty-safe output: a partial read, no gaps, zero style terms. *Owners: Task A4, test `findGaps returns [] for an empty closet`; Task B1, test `compose with an empty closet and no profile is unchanged`.*
5. **The same zone in both define and cover, or BODY_PROFILE withdrawn while learned body preferences exist.** The API rejects the first. Withdrawal removes the proportions and the body-linked preferences, and the next week ranks without them. *Owner: Task B2, tests `PUT likes rejects a zone in define and cover` and `DELETE body drops body-linked prefs`.*

---

## File structure

```
packages/shared/src/closet-style/
  types.ts            contract (done, Task A0)
  fields.ts           trusted/shape/materialsOf gate (done, Task A0)
  colour.ts           hex→OKLCH, neutrals, families, temperature, pair harmony (A1)
  palette.ts          learnPalette, paletteScore (A1)
  fabrics.ts          material table, canonicalMaterial, blends, fabricTerm, defaults (A2)
  proportions.ts      measurements → buckets, ranges (A2)
  rules/women.ts      the women's rule set as data + pieceRuleTerms/lookRuleTerms (A2)
  learn.ts            weekly feature-preference update, learnedScore (A3)
  notes.ts            style reason, gap, palette and learned-line templates; styleWhy (A3)
  copy-lint.test.ts   banned words and body-part-as-subject over every template (A3)
  score.ts            prepareStylePiece, pieceTerms, lookTerms, pairHarmony, featuresOf (A4)
  gaps.ts             findGaps (A4)
  index.ts            the module barrel (A4)
packages/shared/src/schemas/closet-style.ts   zod for the API and composer input (B1)
packages/shared/src/closet-composer/*         integration (B1)
packages/db/src/schema/{measurement-profiles,style-profiles,style-events}.ts (B2)
apps/api/src/routes/closet-style.ts, repositories, jobs (B2)
apps/mobile/app/(onboarding)/you.tsx, style-read, closet/style, wardrobe/gaps … (B3; exact paths follow the app's router)
apps/mobile/modules/body-measure/ (C1)
```

## Waves

| Wave | Tasks | Starts when | Parallel |
|---|---|---|---|
| A | A1, A2, A3 | now, on `STYLE_BASE_TREE` (landed tree + A0) | yes, A1 ‖ A2 ‖ A3 |
| A | A4 | A1–A3 are merged on the A base | after A1–A3 |
| B | B1 | the composer and the fix wave are merged | first in B |
| B | B2 | B1 is merged (needs the BODY_PROFILE consent records and prefs from the fix wave) | B2 ‖ B3 |
| B | B3 | B1 is merged. It builds against the B2 contract below and is checked against B2's API after the merge | B2 ‖ B3 |
| C | C1, C2 | the owner approves the photo-module downloads | C1 then C2 |
| — | I | all of the above | — |

Every task verifies its packages with `LAND/tools/checks.sh <tree> worn_style_<task> <packages>`. The checks script runs tsc, eslint and vitest per package. Use `shared` for wave A.

---

### Task A0: Contract (done)

**Files:** `closet-style/types.ts`, `fields.ts`, `fields.test.ts`. They are in `STYLE/contract` and already in `STYLE_BASE_TREE`.

**Produces:** every type in `types.ts`, plus:
- `trusted(item: StyleItem, field: ShapeField): boolean`
- `shape(item, field)`, which returns the trusted value or undefined
- `materialsOf(item): readonly string[]`
- `SHAPE_FIELD_MIN_CONFIDENCE = 0.8`

---

### Task A1: Colour and palette

**Files:** create `closet-style/colour.ts`, `colour.test.ts`, `palette.ts`, `palette.test.ts`.

**Interfaces:**
- Consumes: `types.ts`.
- Produces:
  - `hexToOklch(hex: string): Oklch | null`. It accepts `#rgb`, `#rrggbb`, with or without `#`, in any case. Anything else is null.
  - `oklabDistance(a: Oklch, b: Oklch): number`
  - `NEUTRAL_CHROMA = 0.04`, `MUTED_CHROMA = 0.1`, `TONAL_LIGHTNESS_GAP = 0.15`, `PRINT_MATCH_DISTANCE = 0.08`
  - `RULE_NEUTRALS = ["denim", "tan", "camel", "olive", "cream"]` and `NAME_NEUTRALS = ["black", "white", "off-white", "grey", "gray", "charcoal", "beige", "ivory", ...RULE_NEUTRALS]`
  - `isNeutral(colour: StyleColour): boolean`. True when the chroma is below 0.04, or any whole word of the name is in `RULE_NEUTRALS`. When the hex is invalid, true when a word of the name is in `NAME_NEUTRALS`.
  - `neutralName(colour: StyleColour): string | null`. Returns the rule name if one matches. Otherwise it goes by lightness: "black" below 0.3, "white" at 0.9 or more, "grey" in between. Null when the colour isn't neutral.
  - `hueFamily(o: Oklch): HueFamily` and `lightBand(o: Oklch): LightBand` (light at 0.75 or more, deep below 0.45, mid between).
  - `temperature(o: Oklch): "warm" | "cool" | "neutral"`. Neutral below 0.04 chroma. Warm when h ≥ 345 or h < 115. Cool otherwise.
  - `FAMILY_RING: readonly HueFamily[] = ["red","orange","yellow","green","teal","blue","purple","pink"]`. It wraps around; brown neighbours red and orange.
  - `export interface HarmonyColour { colour: StyleColour; oklch: Oklch | null; neutral: boolean }`
  - `export interface HarmonyPiece { main: HarmonyColour; colours: readonly HarmonyColour[]; busy: boolean; accent: boolean }`. `busy` means the pattern isn't solid. `accent` means the slot is an accessory or footwear.
  - `harmonyColour(colour: StyleColour): HarmonyColour`
  - `harmony(a: HarmonyPiece, b: HarmonyPiece, festive: boolean): number`
  - `sameWarmth(a: Oklch, b: Oklch): boolean`
  - `learnPalette(items: readonly StyleItem[], metrics: readonly StyleMetric[]): Palette`
  - `paletteBinOf(colour: StyleColour): { key: string; family: HueFamily; band: LightBand } | null`
  - `paletteConfidenceValue(c: PaletteConfidence): number` gives low 0.3, medium 0.6, high 1.0.
  - `paletteScore(item: StyleItem, palette: Palette): number`, from −1 to 1.

**Families** are checked in this order, with h in degrees:

| Family | Rule |
|---|---|
| neutral | c < 0.04 |
| brown | 20 ≤ h < 100, l < 0.55 and c < 0.13 |
| pink / purple | h ≥ 320 or h < 10: pink when l ≥ 0.5, purple otherwise |
| red | 10 ≤ h < 45 |
| orange | 45 ≤ h < 80 |
| yellow | 80 ≤ h < 115 |
| green | 115 ≤ h < 175 |
| teal | 175 ≤ h < 230 |
| blue | 230 ≤ h < 285 |
| purple | 285 ≤ h < 320 |

**Harmony** applies the first rule that matches (§5.3). Δh is the circular hue difference of the main colours, and ΔL is the lightness difference.

| # | When | Score |
|---|---|---|
| 1 | Both pieces are busy | −0.4 |
| 2 | One is busy and the solid's main colour is within 0.08 of any of the print's colours | +0.7 |
| 3 | Either main colour is neutral | +0.6 |
| 4 | Δh < 20 | +0.8 when ΔL ≥ 0.15, else +0.4 |
| 5 | 20 ≤ Δh < 50 | +0.6 |
| 6 | Δh ≥ 150, and one side has c < 0.1 or is the accent | +0.5 |
| 7 | 60 ≤ Δh ≤ 140, and both sides have c ≥ 0.1 | −0.6, or +0.2 when `festive` |
| 8 | Anything else | 0 |

When either side has no valid hex, use names instead: the same last word gives +0.4, a neutral name gives +0.6, and anything else gives 0.

**Palette:**
- Each item colour weighs `share × (1 + ln(1 + wears180))`.
- The bin key is `${family}-${band}`, and a neutral is `neutral-${band}`.
- Rule neutrals (denim, tan, camel, olive, cream) go into the neutral bins.
- The bin's `hex` is its heaviest colour, with ties going to the smallest hex string.
- Keep the top 8 bins by weight, with ties broken by key. `weight` is the bin's share of all colour weight.
- `basis` is "worn" when Σ wears180 > 0.
- `lean` uses non-neutral colours only, and is null when there are none:
  - temperature: "warm" when the warm weight share is 0.6 or more, "cool" when it is 0.4 or less, "mixed" otherwise;
  - chroma: by the weighted mean c, "soft" below 0.1, "bright" at 0.15 or more, "mid" otherwise;
  - depth: by the weighted mean l, "light" at 0.7 or more, "deep" below 0.5, "mid" otherwise.
- `neutrals` lists the `neutralName`s whose weight share is 0.05 or more, heaviest first.
- Confidence, where worn pieces are those with wears180 > 0:
  - low when there are fewer than 10 worn pieces or fewer than 20 wears;
  - high with 30 or more worn pieces and 60 or more wears;
  - medium otherwise.

**`paletteScore`:** for each colour of the item, take a value:
- +min(1, swatch.weight ÷ 0.15) when its bin is a palette swatch;
- +0.3 when a swatch is a neighbour, meaning the same band and the next family on the ring, or the same family and the next band;
- +0.2 when the colour is neutral;
- −0.5 otherwise.

Then take the mean weighted by share, multiply it by `paletteConfidenceValue`, and clamp it to [−1, 1]. An item with no attributes scores 0.

- [ ] **Step 1: Write the failing tests**
  - `hexToOklch matches reference values`, within l ±0.003, c ±0.003 and h ±0.6°:
    - `#ffffff` → l 1, c ≈ 0
    - `#000000` → l 0
    - `#ff0000` → (0.6280, 0.2577, 29.23)
    - `#00ff00` → (0.8664, 0.2948, 142.50)
    - `#0000ff` → (0.4520, 0.3132, 264.05)
    - `#abc` equals `#aabbcc`
    - `"zzz"`, `""` and `"#12345"` give null
  - `hueFamily bins named colours`:

    | Hex | Family |
    |---|---|
    | #8b4513 | brown |
    | #ffa500 | orange |
    | #ffd700 | yellow |
    | #008000 | green |
    | #008080 | teal |
    | #000080 | blue |
    | #800080 | purple |
    | #ff00ff | pink |
    | #ff69b4 | pink |
    | #800000 | red |
    | #808080 | neutral |

  - `isNeutral by chroma and by rule name`:
    - `{name:"olive", hex:"#808000"}` is true
    - `{name:"denim blue", hex:"#1560bd"}` is true
    - `{name:"navy", hex:"#000080"}` is false
    - `{name:"black", hex:"bad"}` is true
  - `harmony rule table`: one case per row 1–8. Row 7 is tested with `festive` both false (−0.6) and true (+0.2). Use pink #ff1493 with orange #ff8c00 for the festive pair.
  - `harmony falls back to names when a hex is missing or malformed` (Review Focus 1). An empty colours list never throws, and `harmonyColour` handles any input.
  - `learnPalette is deterministic`: shuffling the items and metrics gives a deep-equal palette.
  - `learnPalette weights wears`: 10 navy pieces never worn and 2 rust pieces worn 30 times each put rust first.
  - `learnPalette caps at 8 swatches`.
  - `palette confidence thresholds`:
    - 9 worn pieces with 100 wears gives low;
    - 10 worn pieces with 19 wears gives low;
    - 10 worn pieces with 20 wears gives medium;
    - 30 worn pieces with 60 wears gives high;
    - 0 wears gives low with basis "owned".
  - `paletteScore`:
    - an in-palette heavy colour scores more than a neighbour;
    - a neighbour scores more than a far colour;
    - every score lies in [−1, 1];
    - the score scales with confidence.
- [ ] **Step 2: Run them and see them fail.** Run `node <vitest> run src/closet-style/colour.test.ts src/closet-style/palette.test.ts` from `W/packages/shared`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `colour.ts`.** Convert sRGB to linear to OKLab to OKLCH with Ottosson's published matrices. h is `atan2` in degrees, normalised to [0, 360), and 0 when c < 1e-9.
- [ ] **Step 4: Implement `palette.ts`** as specified above.
- [ ] **Step 5: Run the tests and see them pass,** then run `checks.sh W worn_style_a1 shared`. Expected: PASS.
- [ ] **Step 6: Produce the patch and report** (common rules §4).

---

### Task A2: Fabrics, proportions and the women's rules

**Files:** create `closet-style/fabrics.ts`, `fabrics.test.ts`, `proportions.ts`, `proportions.test.ts`, `rules/women.ts`, `rules/women.test.ts`.

**Interfaces:**
- Consumes: `types.ts` and `fields.ts`.
- Produces:
  - `type Material` is the union of the 26 canonical names: `cotton | mulmul | khadi | linen | chambray | denim | silk | satin | chiffon | georgette | crepe | organza | net | brocade | banarasi | chanderi | viscose | modal | polyester | nylon | wool | velvet | jersey | stretch_blend | leather | faux_leather`.
  - `interface FabricProfile`. Every score is an integer from 1 to 5:
    - `breathability`, `warmth`;
    - `drape`, from 1 (structured) to 5 (fluid);
    - `cling`, where 5 sits closest;
    - `sheen`;
    - `crease`, where 5 creases most;
    - `care`, where 5 is easiest;
    - `rain`, where 5 dries fastest;
    - `lean: readonly ("day" | "evening" | "festive")[]`.
  - `MATERIALS: Readonly<Record<Material, FabricProfile>>` and `MATERIAL_ALIASES: Readonly<Record<string, Material>>`.
  - `canonicalMaterial(raw: string): Material | null`. It lowercases, trims, drops percentages and digits, maps `-`, `_` and `/` to spaces, collapses spaces, and then checks exact names, then aliases, then whole words.
  - `interface BlendedFabric { parts: readonly { material: Material; weight: number }[]; profile: Readonly<Record<Exclude<keyof FabricProfile, "lean">, number>>; lean: ReadonlySet<"day"|"evening"|"festive"> }`
  - `fabricOf(materials: readonly string[]): BlendedFabric | null`
  - `defaultWarmth(f: BlendedFabric): { minC: number; maxC: number }` and `defaultRainOk(f: BlendedFabric): boolean`, which is true when rain ≥ 3.
  - `FABRIC_RULES`, a const holding every number below.
  - `fabricTerm(f: BlendedFabric | null, day: StyleDay, likes: Likes | null): Term`
  - `MEASUREMENT_RANGES_CM = { height: [120, 220], bust: [60, 180], waist: [40, 170], hip: [60, 190], shoulder: [25, 60] }`
  - `interface Measurements { heightCm?: number|null; bustCm?: number|null; waistCm?: number|null; hipCm?: number|null; shoulderCm?: number|null; photo?: PhotoMeasures|null }`
  - `interface PhotoMeasures { shoulderWidth: number; waistWidth: number; hipWidth: number; torsoLength: number; legLength: number; quality: "rough" | "good" }`
  - `PROPORTION_THRESHOLDS`, a const holding the numbers below.
  - `proportionsOf(m: Measurements, opts?: { photoFills?: readonly ("waist"|"balance"|"torso")[] }): Proportions`. `photoFills` defaults to all three.
  - `interface RulePiece { item: StyleItem; fabric: BlendedFabric | null; lightness: number | null }`. `lightness` is the main colour's OKLCH L, supplied by the caller.
  - `type Axis = "waist" | "shoulders" | "legs" | "arms" | "midriff" | "back" | "sit"`
  - `interface BodyRule { id: StyleReasonId; trigger: { like: string } | { proportion: keyof Proportions; is: string }; axes: Partial<Record<Axis, 1 | -1>>; scope: "piece" | "look"; match: (...) => { score: number; params: ReasonParams } | null }`
  - `WOMEN_RULES: readonly BodyRule[]`
  - `pieceRuleTerms(p: RulePiece, likes: Likes | null, proportions: Proportions | null): { likes: Term; proportion: Term }`
  - `lookRuleTerms(look: readonly RulePiece[], likes: Likes | null, proportions: Proportions | null): { likes: Term; proportion: Term }`

**Fabric values.** Fill the table with honest textile values, which the stylist will review. The tests pin these:
- linen: breathability 5, crease 5
- cotton: breathability 5
- polyester: breathability ≤ 2, rain ≥ 4
- nylon: rain 5
- satin: sheen 5
- velvet: warmth ≥ 4, and its lean includes evening and festive
- denim: rain ≤ 2, drape ≤ 2
- crepe: crease ≤ 2
- jersey: cling ≥ 4
- wool: warmth 5
- brocade and banarasi: lean includes festive

**Aliases** include at least:

| Alias | Material |
|---|---|
| "art silk" | viscose |
| "mul" | cotton |
| "rayon" | viscose |
| "lycra", "spandex", "elastane" | stretch_blend |
| "knit" | jersey |
| "pu", "vegan leather" | faux_leather |
| "poly" | polyester |

**Blends:**
- The first material weighs 0.6, and the rest share 0.4 equally.
- A single material weighs 1.
- Unknown materials after the first are dropped, and the rest is renormalised.
- If the first material is unknown, the result is null (§5.4: unknown never guesses).
- The profile is the weighted mean of each score, and `lean` is the union of the parts' leans.

**Warmth defaults** by the blended warmth, rounded:

| Warmth | minC–maxC |
|---|---|
| 1 | 24–45 |
| 2 | 18–40 |
| 3 | 12–32 |
| 4 | 5–25 |
| 5 | −10–18 |

**`fabricTerm` rules** (sum, then clamp to [−1, 1]; a null fabric gives `ZERO_TERM`):

| Rule | When | Effect | Reason |
|---|---|---|---|
| Heat | highC ≥ 30 | breathability ≥ 4: +0.5. Lead material polyester, satin or velvet: −0.5. When humidity ≥ 0.7, another ±0.2 the same way. | `BREATHABLE_HEAT {materials: "Linen and cotton", highC}`, with materials as display names joined by " and " |
| Rain | rainChance ≥ 0.6 | rain ≥ 4: +0.4. rain ≤ 2: −0.3. | `DRIES_FAST {material}` on the plus side |
| Long day | longDay | crease ≤ 2 and breathability ≥ 3: +0.3, plus +0.1 for stretch_blend or jersey parts | `LOW_CREASE_LONG_DAY {material, hours}`. Omit `hours` when null. |
| Occasion | always | The day type's lean (work and casual → day, evening → evening, festive → festive) is in `lean`: +0.3. On work and casual days, sheen ≥ 4: −0.2. On casual days, jersey or cotton leads: +0.1. | — |
| Likes | likes set | sit relaxed, or any cover like, with cling ≥ 4: −0.3 | — |

**Proportions:**

| Bucket | From tape | From the photo | Values |
|---|---|---|---|
| waist | r = min(waist/hip, waist/bust) over what exists | waistWidth/hipWidth | tape: defined at r ≤ 0.75, straight at r ≥ 0.85, moderate between. Photo: defined at ≤ 0.80, straight at ≥ 0.90. |
| balance | bust/hip | shoulderWidth/hipWidth | tape: top_wider at ≥ 1.05, bottom_wider at ≤ 0.95. Photo: top_wider at ≥ 1.12, bottom_wider at ≤ 0.98. Balanced between. |
| torso | — | torsoLength/legLength | longer_torso at ≥ 0.64, longer_legs at ≤ 0.54, balanced between |

- Confidence is 1 for tape, 0.7 for photo "good" and 0.35 for photo "rough".
- Tape wins wherever it can compute a bucket, and the photo fills only buckets tape can't.
- A number that is missing, non-finite, ≤ 0 or outside `MEASUREMENT_RANGES_CM` counts as missing.
- A photo value that is ≤ 0 or non-finite also counts as missing.

**Rules.** Rows marked "like" score +0.5 on a match and −0.5 on a clear opposite. Rows marked "proportion" score +0.5 × bucket confidence on a match and never score down. Each row reads trusted shape fields only, through `shape()`, and every row has a test.

| Id | Trigger | Scope | Matches (opposite) | Axes | Params |
|---|---|---|---|---|---|
| DEFINES_WAIST | like define waist; or waist "defined" | piece | fit.waist defined, fitted or ruched; silhouette a_line or fitted; subtype contains wrap, belted or tie. Opposite: silhouette oversized | waist +1 | `{piece}` = the subtype's last word |
| SKIMS_WAIST | waist "straight" | piece | silhouette straight, relaxed or a_line; fit.waist relaxed or unstructured; subtype contains empire | waist −1 | `{piece}` |
| VOLUME_BELOW | balance "top_wider" | look | the bottom or dress silhouette is a_line or flowy, or its subtype contains wide, flare, anarkali or lehenga; the top's neckline is v or scoop; no volumeAt shoulders on the top | shoulders −1 | `{piece}` = the flared piece |
| INTEREST_ABOVE | balance "bottom_wider" | look | the top has neckline off_shoulder, collar or other boat-like, or volumeAt shoulders or sleeves, or pattern embroidered; and the bottom is solid or ≥ 0.15 darker (lightness) | shoulders +1 | `{detail}` is "neckline", "sleeves" or "embroidery" |
| HIGH_RISE | torso "longer_torso" | look | the bottom has rise high, and the top's length is cropped or waist, or the kurta's length is hip, thigh or knee | legs +1 | — |
| LONG_TOP | torso "longer_legs" | look | the bottom has rise mid, or the top or kurta length is thigh, knee or calf | legs −1 | — |
| COVERS | like cover zone | piece, plus a look layer | arms: sleeve elbow, three_quarter or long. midriff: coverage.midriff covered. legs: coverage.legs midi, ankle, floor or trousers. back: coverage.back covered. A LAYER in the look covering arms counts for the arms zone. Opposite: that zone bare (arms: sleeveless, strapless or cap) | that zone −1 (cover) | `{zone, sleeve?}` |
| SHOWS_SHOULDERS | like define shoulders | piece | neckline off_shoulder or one_shoulder, or volumeAt shoulders | shoulders +1 | `{neckline}` |
| SHOWS_LEGS | like define legs | piece | coverage.legs above_knee or knee | legs +1 | `{length}` |
| EASY_FIT | like sit relaxed | piece | silhouette relaxed, oversized or flowy, or fit relaxed or unstructured; plus fabric cling ≤ 2. Opposite: bodycon | sit −1 | `{material?}` |
| CLEAN_LINE | like sit fitted | piece | silhouette fitted or bodycon, or fit.waist fitted; plus fabric drape ≤ 2. Opposite: oversized | sit +1 | `{material?}` |

- **Conflict rule:** collect the axes of every like-triggered rule that fires. A proportion rule whose axis sign is opposite on any shared axis contributes 0 and emits no reason.
- `likes.sit === "either"` triggers neither EASY_FIT nor CLEAN_LINE.
- A zone listed in both define and cover is ignored for both (the API rejects it, Task B2).
- Each term clamps to [−1, 1].

- [ ] **Step 1: Write the failing tests**
  - `canonicalMaterial normalises free text` (Review Focus 2):
    - "60% Cotton" → cotton
    - "Art-Silk" → viscose
    - "cotton/poly" → cotton
    - "" → null
    - "unobtainium" → null
    - "Mul" → cotton
    - "Stretch Denim" → denim
  - `fabricOf blends 0.6 and 0.4`, `fabricOf returns null when the first is unknown` and `fabricOf drops later unknowns`.
  - `fabric pinned values`: the list above.
  - `fabricTerm`: one test per row of the rule table, with exact expected scores. Heat at 29 °C versus 30 °C is a boundary. Rain at 0.59 versus 0.6 is a boundary.
  - `proportionsOf from tape`:
    - waist 70, hip 100 → defined;
    - waist 85, hip 100 → moderate;
    - waist 90, hip 100, bust 100 → straight;
    - bust 100, hip 90 → top_wider.
  - `proportionsOf prefers tape over photo` and `photo fills only what tape can't`.
  - `proportionsOf ignore implausible numbers` (Review Focus 3): waist 0, hip 500, NaN and negative values each leave only that bucket unknown.
  - `photoFills limits the photo`: `photoFills: ["balance","torso"]` leaves waist null with a photo.
  - `photo confidence`: good gives 0.7 and rough gives 0.35.
  - One test per rule row, covering a match and an opposite where the row has one.
  - `rules ignore untrusted fields`: the same piece at confidence 0.79 scores 0.
  - `likes beat proportions`:
    - waist "straight" with like define waist gives SKIMS_WAIST 0 and DEFINES_WAIST > 0;
    - balance "top_wider" with like define shoulders gives VOLUME_BELOW 0.
  - `either sit fires neither`.
  - `terms clamp to [-1, 1]` over a look that matches every rule.
- [ ] **Step 2: Run them and see them fail.** Expected: FAIL (module not found).
- [ ] **Step 3: Implement `fabrics.ts`.**
- [ ] **Step 4: Implement `proportions.ts`.**
- [ ] **Step 5: Implement `rules/women.ts`.** The rules are data rows. `pieceRuleTerms` and `lookRuleTerms` evaluate them, applying the conflict rule.
- [ ] **Step 6: Run the tests and see them pass,** then run `checks.sh W worn_style_a2 shared`. Expected: PASS.
- [ ] **Step 7: Produce the patch and report.**

---

### Task A3: Learning, notes and the copy lint

**Files:** create `closet-style/learn.ts`, `learn.test.ts`, `notes.ts`, `notes.test.ts`, `copy-lint.test.ts`.

**Interfaces:**
- Consumes: `types.ts`.
- Produces:
  - `type StyleAction = "kept" | "swapped_out" | "swapped_in" | "locked" | "skipped" | "worn" | "gap_dismissed"`
  - `ACTION_VALUE: Readonly<Record<StyleAction, number>>`: locked +1, worn +1, swapped_in +1, kept +0.25, swapped_out −1, skipped −0.5, gap_dismissed −0.5.
  - `interface StyleSignal { action: StyleAction; dayType: DayType; features: readonly FeatureValue[] }`
  - `LEARN = { decay: 0.7, minSupport: 3, cap: 200, learnedWeight: 0.3, learnedClamp: 0.5 }`
  - `prefKey(p: { dayType: DayType; feature: FeatureValue }): string`, which gives `${dayType}|${feature}`.
  - `updatePreferences(prev: readonly FeaturePref[], week: readonly StyleSignal[]): FeaturePref[]`
  - `learnedScore(features: readonly FeatureValue[], dayType: DayType, prefs: readonly FeaturePref[]): number`
  - `BODY_LINKED_FAMILIES: ReadonlySet<FeatureFamily>` = silhouette, length and rise.
  - `dropBodyLinked(prefs: readonly FeaturePref[]): FeaturePref[]`
  - `resetPreference(prefs: readonly FeaturePref[], key: string): FeaturePref[]`
  - `activePreferences(prefs): FeaturePref[]`, the ones with support ≥ 3 and |value| ≥ 0.2.
  - `STYLE_REASON_TEMPLATES: Readonly<Record<StyleReasonId, (p: ReasonParams) => string>>`
  - `styleWhy(reasons: readonly StyleReason[]): string | null`
  - `GAP_WHY_TEMPLATES: Readonly<Record<GapWhyId, (p: ReasonParams) => string>>`
  - `gapWhat(c: GapCandidate): string`
  - `paletteLeanLine(p: Palette): string | null`
  - `paletteConfidenceLine(p: Palette): string`
  - `learnedLine(p: FeaturePref): string`
  - `ALL_TEMPLATE_SAMPLES(): string[]`, every template rendered with sample params, for the lint.
  - `BANNED_WORDS: readonly string[]` and `BODY_PARTS: readonly string[]`

**Update rule:**
- For each key, take this week's mean signal m over the signals that carry its feature.
- The new value is `clamp(old × 0.7 + m × 0.3, −1, 1)`. A key without signals this week decays: `old × 0.7`, removed below |0.01|.
- `support` counts the signals whose sign agrees with the new value's sign. If the sign flipped, support restarts at this week's agreeing count.
- After the update, keep the top 200 by |value| × support, ties broken by key, and return them sorted by key.

**`learnedScore`:** Σ value × 0.3 over active prefs matching the day type and any of the features, clamped to ±0.5.

**Templates.** These are the spec's words. Other templates follow the same voice: the garment is the subject.

| Id | Template |
|---|---|
| DEFINES_WAIST | `The ${piece} ties at the waist.` when `how: "ties"`, else `The ${piece} is shaped at the waist.` |
| SKIMS_WAIST | `It falls straight from the shoulder.` |
| VOLUME_BELOW | `The flare at the hem balances the look.` |
| INTEREST_ABOVE | `The detail sits at the ${detail}.` |
| HIGH_RISE | `A high rise under a short top.` (`over: "top"`) / `A high rise under the kurta.` (`over: "kurta"`) |
| LONG_TOP | `The ${top} falls past the hip.` (`via: "top"`, `top` names the long piece) / `A mid rise, sitting below the waist.` (`via: "rise"`) |
| COVERS | arms: `${Sleeve} sleeves.`; midriff: `Covered through the middle.`; legs: `It runs to the ankle.`; back: `A high back.` |
| EASY_FIT | `Loose through the body, in a soft ${material}.` (without material: `Loose through the body.`) |
| CLEAN_LINE | `A close fit in a fabric that holds its shape.` |
| SHOWS_SHOULDERS | `The ${neckline} neckline opens at the shoulders.` |
| SHOWS_LEGS | `A ${length}-length hem.` |
| BREATHABLE_HEAT | `${materials} for a ${highC}° day.` |
| LOW_CREASE_LONG_DAY | `${Material} won't crease over ${hours} hours.` (without hours: `${Material} won't crease over a long day.`) |
| DRIES_FAST | `Denim stays home; this dries fast.` when the optional param `avoided` is "denim", else `${Material} dries fast.` No wave A caller sets `avoided`. |

- `styleWhy` takes the 2 strongest reasons by strength, ties broken by id. Each id appears at most once. They are joined with a space. It returns null when there are none.

**Gap and palette words:**
- `gapWhat`: `a ${colour} ${slotNoun}` plus a feature phrase. The colour is the neutral name, or the band and family ("deep teal"). Slot nouns: TOP top, BOTTOM bottom, DRESS dress, KURTA kurta, BLOUSE blouse, LAYER layer, FOOTWEAR pair of shoes, BAG bag, DUPATTA dupatta, SAREE saree. Feature phrases:

  | Feature | Phrase |
  |---|---|
  | defines_waist | "that ties at the waist" |
  | rain_ok | "for rain" |
  | evening | "for evenings" |
  | festive | "for festive days" |
  | layer_warm | "for cool mornings" |
  | covers_arms | "with elbow sleeves" |
  | covers_legs | "that runs to the ankle" |
  | covers_midriff | "covered through the middle" |
  | covers_back | "with a high back" |
  | relaxed | "with an easy fit" |
  | fitted | "with a close fit" |

- Gap why templates:

  | Id | Template |
  |---|---|
  | OCCASION_NO_LOOK | `Nothing in your closet fits ${label} on ${weekday}.` |
  | SLOT_MISSING | `No ${slotNoun} for ${dayTypes} days yet.` |
  | RAIN_FOOTWEAR | `No shoes for rain.` |
  | LAYER_COOL_MORNINGS | `Nothing to layer on cool mornings.` |
  | BLOUSE_FOR_SAREES | `No blouse that goes with ${count} of your sarees.` |
  | EVENING_IN_COLOURS | `Nothing evening-ready in your colours.` |
  | NEUTRAL_BOTTOM_FOR_PRINTS | `No neutral bottom for ${count} printed tops.` |
  | LIKE_UNMET | `Nothing ${phrase} for ${dayTypes} days.` |

- `paletteLeanLine`: `Mostly ${temperature} and ${chroma}, with ${neutrals} as your neutrals.`
  - "mixed" reads "a mix of warm and cool".
  - Neutrals are joined with ", " and " and ", and the clause is dropped when there are none.
  - It returns null when `lean` is null.
- `paletteConfidenceLine`:
  - owned basis: `From the ${n} pieces you've added. It sharpens as you wear things.`
  - worn, low: `From what you've worn so far. It sharpens as you wear more.`
  - medium: `From what you wear most.`
  - high: `From months of what you wear.`
- `learnedLine`: a negative value gives `You swap out ${featureWords} on ${dayType} days`, and a positive one gives `You keep ${featureWords} for ${dayType} days`. Feature words: sleeve:sleeveless → "sleeveless tops", colour:x → "x pieces", fabric:x → "x", silhouette:x → "x fits", pattern:x → "x prints", neckline:x → "x necklines", length:x → "x lengths", rise:x → "x-rise bottoms". Day-type words: work "office", casual "casual", evening "evening", festive "festive", active "gym".

**Copy lint** (`copy-lint.test.ts`, over `ALL_TEMPLATE_SAMPLES()`):
- No banned word, case-insensitive and whole word. Multi-word entries match as phrases.
- Each `BODY_PARTS` word must appear only as `(at|from|to|over|below|above|on|around|through|past|across) the <part>`. The exception is a hyphenated garment compound such as "wide-leg" or "straight-leg".
- "your <part>" always fails.
- `BODY_PARTS`: waist, hip, hips, bust, chest, shoulder, shoulders, arm, arms, leg, legs, thigh, thighs, stomach, tummy, belly, midriff, body, curves, frame.
- "Loose through the body" passes under the rule ("through the body").

- [ ] **Step 1: Write the failing tests**
  - `updatePreferences decays and averages`: prev 0.5 with signals −1, −1 gives 0.5×0.7 + (−1)×0.3 = 0.05.
  - `support restarts when the sign flips`.
  - `a pref counts only from 3 consistent signals` (activePreferences).
  - `cap keeps the strongest 200`, with 250 inputs.
  - `deterministic order` and `learnedScore is bounded to ±0.5`.
  - `dropBodyLinked keeps colour and sleeve prefs`.
  - `resetPreference removes one key`.
  - `every reason id has a template` and `styleWhy picks the two strongest, deduped`.
  - The spec's literal strings render exactly:
    - "The wrap ties at the waist."
    - "Linen and cotton for a 34° day."
    - "Crepe won't crease over nine hours." uses the word form for hours ≤ 10, so `hours: 9` renders "nine".
    - "Denim stays home; this dries fast."
  - `paletteLeanLine` renders "Mostly cool and soft, with black and cream as your neutrals."
  - `paletteConfidenceLine` owned with 14 renders "From the 14 pieces you've added. It sharpens as you wear things."
  - `learnedLine` renders "You swap out sleeveless tops on office days".
  - `copy lint passes on every template`, plus `copy lint catches offenders` on a fixture list that includes "slimming", "flatters your hips", "Your waist looks" and "hide the tummy". All must fail.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement `learn.ts`.**
- [ ] **Step 4: Implement `notes.ts`.** Number words for 1–10 live in this file.
- [ ] **Step 5: Run the tests and see them pass,** then run `checks.sh W worn_style_a3 shared`. Expected: PASS.
- [ ] **Step 6: Produce the patch and report.**

---

### Task A4: Scoring, gaps and the barrel (after A1–A3)

**Files:** create `closet-style/score.ts`, `score.test.ts`, `gaps.ts`, `gaps.test.ts`, `index.ts`.

**Interfaces:**
- Consumes: everything in A0–A3, by the names above.
- Produces:
  - `STYLE_WEIGHTS = { likes: 1.0, proportion: 0.5, palette: 0.5, fabric: 0.6 } as const`
  - `ACCENT_SLOTS: ReadonlySet<ItemSlot>` = FOOTWEAR, BAG, EARRINGS, NECKLACE, BANGLES, WATCH, HAIR_ACCESSORY.
  - `interface StylePiece { item: StyleItem; harmony: HarmonyPiece; fabric: BlendedFabric | null; lightness: number | null; features: readonly FeatureValue[]; rule: RulePiece }`
  - `prepareStylePiece(item: StyleItem): StylePiece`. It runs once per item per compose.
  - `featuresOf(item: StyleItem): FeatureValue[]`. It gives `colour:<family of main colour>`, `pattern:<pattern>`, `fabric:<lead material>`, and the trusted silhouette, length and rise, plus sleeve and neckline when set.
  - `interface StyleContext { profile: StyleProfileInput | null; palette: Palette }`
  - `pieceTerms(p: StylePiece, day: StyleDay, ctx: StyleContext): { likes: Term; palette: Term; fabric: Term }`. `likes` is the rule likes plus `learnedScore`, clamped. `palette` is `paletteScore`, with no reasons. `fabric` is `fabricTerm`.
  - Metals (§5.3), for EARRINGS, NECKLACE, BANGLES and WATCH: a colour name containing "gold" adds `METAL_WEIGHT = 0.1` to `palette` when the palette leans warm, and subtracts it when it leans cool. "silver" does the reverse.
  - `lookTerms(look: readonly StylePiece[], day: StyleDay, ctx: StyleContext): { likes: Term; proportion: Term }`. The piece-scope proportion rules are averaged over the look's pieces and the look-scope ones added, then clamped.
  - `weighted(terms: { likes?: Term; proportion?: Term; palette?: Term; fabric?: Term }, multipliers?: Partial<Record<keyof typeof STYLE_WEIGHTS, number>>): number`, which gives Σ STYLE_WEIGHTS[k] × (multiplier ?? 1) × score.
  - `pairHarmony(a: StylePiece, b: StylePiece, day: StyleDay): number`. Here `festive` is `(day.festive && day.formality >= 4) || (a and b both have formality ≥ 4 and feel "festive")`.
  - `findGaps(input: GapInput, countLooks: LookCounter, limit = 5): Gap[]`
  - `interface GapInput { items: readonly StyleItem[]; palette: Palette; profile: StyleProfileInput | null; days: readonly StyleDay[]; occasions: readonly OccasionGapInput[]; dismissed: readonly { key: string; until: string }[]; today: string }`
  - `interface OccasionGapInput { date: string; label: string; weekday: string; slot: ItemSlot; formality: number; festive: boolean }`
  - `GAP_LIMITS = { candidates: 60, dismissDays: 90 }`

**Gaps:**
1. Kinds and their candidates, in priority order:
   - **occasion:** one candidate per `occasions` entry, with feature festive or evening from the entry and colours from the palette's top swatch.
   - **piece:** for each slot in [TOP, BOTTOM, DRESS, KURTA, BLOUSE, LAYER, FOOTWEAR, BAG, DUPATTA] with 0 non-deleted tagged items, check a day in `days` needs it:
     - a rainy day (rainChance ≥ 0.6) needs FOOTWEAR rain_ok, which gives RAIN_FOOTWEAR;
     - a day with highC < 22 needs a LAYER, which gives LAYER_COOL_MORNINGS;
     - SAREEs with no BLOUSE in a matching family give BLOUSE_FOR_SAREES;
     - any other empty slot that a day type uses gives SLOT_MISSING.
   - **colour:** no item with eveningOk in a palette family gives EVENING_IN_COLOURS. Four or more busy TOPs and no neutral BOTTOM gives NEUTRAL_BOTTOM_FOR_PRINTS.
   - **like:** a like with no trusted piece matching its rule for a day type gives LIKE_UNMET.
2. Colours for each candidate, in order:
   - the palette swatches;
   - then neighbours of the heaviest swatch, at one step on the ring;
   - then neutrals from RULE_NEUTRALS, black and white that aren't in `palette.neutrals`.
   - With an empty palette, use black, white and denim.
3. Generate in the order kind → slot list order → colour order → feature, dedupe by key, and truncate to 60 before counting.
4. `unlocks = countLooks(candidate)`. Drop candidates with 0 unlocks, and drop dismissed keys whose `until` is after `today`.
5. Sort by kind priority, then unlocks descending, then forDate ascending (nulls last), then key. Keep one gap per (kind, slot), the best one, and return the first `limit`.

- [ ] **Step 1: Write the failing tests**
  - `prepareStylePiece is stable`: two calls deep-equal.
  - `featuresOf skips untrusted shape fields`.
  - `pieceTerms` and `lookTerms` with no profile give `likes.score` from learned prefs only (0 when there are none) and `proportion` 0. Palette and fabric still apply (§5.1).
  - `likes beat proportions end to end`.
  - `weighted applies multipliers` and `pairHarmony festive context`.
  - `rank never remove` (property test with a seeded LCG in the test file):
    - generate 200 random looks;
    - the set of looks is unchanged and only their scores differ;
    - assert `weighted` is finite and within [−2.6, 2.6] (the sum of the weights).
  - `findGaps returns [] for an empty closet` (Review Focus 4) with a counter that returns 0.
  - `findGaps priorities and limits`, using a fake counter keyed on slot.
  - `findGaps dedupes per kind and slot`.
  - `findGaps honours dismissals until the date` and `findGaps is deterministic`.
  - `findGaps never emits more than 60 counts`: the counter is called at most 60 times.
  - `gaps stay one step from the palette`: every candidate colour is a swatch, a ring neighbour of the heaviest one, or a neutral.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement `score.ts`.**
- [ ] **Step 4: Implement `gaps.ts`.**
- [ ] **Step 5: Write `index.ts`.** It re-exports the public names of every module as a named list, matching the style of `packages/shared/src/index.ts`. The main barrel is not edited here (Task B1 does that).
- [ ] **Step 6:** Add a benchmark test, `score budget`: prepare 300 pieces and score 7 days × 2,000 looks, which must finish in under 50 ms on this machine. Report the measured time.
- [ ] **Step 7: Run `checks.sh W worn_style_a4 shared`.** Expected: PASS.
- [ ] **Step 8: Produce the patch and report.**

**Contract changes accepted during A4 (2026-10-27):**
1. The gap rank breaks ties on palette colour order before the key.
2. Candidates are spread round-robin across (kind, slot) groups instead of being cut off after the first 60.
3. A dismissal matches kind + slot + feature (plus the date for occasions), not the full key with its colour (`gapDismissKey`).
4. GapFeature has no entry for define:shoulders or define:legs, so those likes produce no like gaps.
5. The fabric comes from `fabricOf(materialsOf(item))`.
6. The gap and reason templates live in `closet-style/notes.ts`.
7. New exports: `LOOK_CACHE_MAX`, `GAP_LIMITS.dismissDays` (90; B1 sets `until` from it), and `OccasionGapInput` in gaps.ts (B1 builds it from composer output).

---

### Task B1: Composer integration

**Starts when** the composer agent's files and the fix wave are merged into one tree.

**Files:**
- Modify: `schemas/closet-item.ts` (ItemAttributes gains `rise`, `length` and `volumeAt`, all optional)
- Modify: `closet-composer/input.ts`. `ComposerMetricSchema` gains `wears180` (optional int ≥ 0). `ComposeWeekInputSchema` gains `styleProfile` (optional). `ComposerSettingsSchema.weights` gains `likes`, `proportion`, `palette` and `fabric` with the existing bounds.
- Modify: `closet-composer/pieces.ts`, `looks.ts`, `week.ts`, `outfit.ts` (`COMPOSER_VERSION = "closet-composer/2"`) and `closet-notes.ts`, which re-exports the style templates.
- Modify: `schemas/closet-week.ts`. The outfit gains `styleWhy: string | null`, optional and defaulting to null.
- Create: `schemas/closet-style.ts`. It holds the zod schemas for `Likes`, `Proportions`, `FeaturePref`, `StyleProfileInput` and the B2 route bodies. Likes are refined so that no zone is in both define and cover.
- Modify: `closet-style/types.ts`. Replace the mirrored unions with imports from `schemas/closet-item.ts`. Add a type test that `ComposerItem` is assignable to `StyleItem`.
- Modify: `packages/shared/src/index.ts`, adding the closet-style and schema exports next to the composer's.

**Interfaces:**
- Produces:
  - `toStyleDay(day: Day): StyleDay`. The day type is festive for festive kinds, evening when `evening`, work when the day has WORK_KINDS, active when `active`, and casual otherwise. `longDay` is `long`, and `hours` is the longest event's hours when known.
  - The palette is computed once per compose from the items and `wears180`, and is covered by `inputsHash`.
  - The `unary` per-piece score adds `weighted(pieceTerms)`. The look score adds `weighted(lookTerms)`. `harmony(lead, p)` becomes `pairHarmony`, which falls back to the old name-based harmony when both sides have no hex.
  - `styleWhy` comes from the chosen look's reasons through `styleWhy()`.
  - When tagging left them empty, `rainOk` falls back to `defaultRainOk` and the warmth range to `defaultWarmth` (§5.4). The "same warmth" note uses `sameWarmth`.
  - `countLooksWith(closet, candidate, days): number` for gaps, built on the look builder with a synthetic piece.

- [ ] **Step 1: Write the failing tests**
  - `site parity fixture lines unchanged`: the existing plan §6.14 fixture produces every site line exactly. If the new harmony changes a winner, tune the starting values; change the site example only if plan §8.5 allows.
  - `compose with an empty closet and no profile is unchanged` (Review Focus 4).
  - `same passing set with and without a profile` (property test over the 20 synthetic closets × 4 profiles: none, likes only, tape, tape + photo).
  - `deterministic` and `no violations`.
  - `styleWhy shows at most two phrases`.
  - `budget`: 300 pieces in at most 350 ms with style on, measured against style off.
- [ ] **Step 2: Implement the changes** listed under Files.
- [ ] **Step 3: Run `checks.sh <tree> worn_style_b1 shared api mobile`.** Expected: PASS.
- [ ] **Step 4: Produce the patch and report,** including the measured budgets.

---

### Task B2: Data, API, consent and jobs

**Starts when** B1 is merged.

**Files:**
- Drizzle schema:
  - `measurement_profiles` gains `sources jsonb not null default '{}'`, `is_self boolean not null default false` with a partial unique index on `(user_id) where is_self`, and `updated_at`.
  - New `style_profiles` and `style_events`, as in §9.1. `style_events.action` is an enum matching `StyleAction` without `gap_dismissed`. A dismissal is stored on `style_profiles.dismissed_gaps` and as a signal row with action `skipped` and context `{gap: key}`.
  - One generated migration.
- Consent: add the `BODY_PROFILE` scope to the per-purpose consent records built by the fix wave, with the notice text in English and Hindi.
- Repositories (memory and Postgres), each with tests:
  - `getStyleProfile`, `upsertStyleLikes`, `saveSelfMeasurements` (recomputes proportions with `proportionsOf`), `deleteBodyProfile` (deletes the self points, proportions and `dropBodyLinked`);
  - `resetLearned`, `dismissGap`;
  - `appendStyleEvents`, which is idempotent on (user, outfit, action, item);
  - `listStyleEventsSince`.
- Routes, in `apps/api/src/routes/closet-style.ts`. All need auth; another user's resource gets 404.

  | Route | Body | Response | Errors |
  |---|---|---|---|
  | `GET /closet/style` | — | `{ likes, proportions, measurements: {points, sources}, consent: {bodyProfile: boolean}, learned: {key, line}[] }` | — |
  | `PUT /closet/style/likes` | `Likes` | the profile | 400 if a zone is in both define and cover |
  | `PUT /closet/style/measurements` | `{ heightCm?, bustCm?, waistCm?, hipCm?, shoulderCm?, photo?: PhotoMeasures, sources }` | the profile | 403 `consent_required` without BODY_PROFILE; 400 out of range |
  | `DELETE /closet/style/body` | — | 204 | — |
  | `DELETE /closet/style/learned/:key` | — | 204 | — |
  | `GET /closet/style-read` | — | `{ palette, leanLine, confidenceLine, leanTowards: {line, itemIds[1..3]}[≤3], gaps: Gap[≤3], partial: boolean }` | — |
  | `GET /closet/gaps` | — | `{ gaps: (Gap & {whatLine, whyLine})[≤5] }` | — |
  | `POST /closet/gaps/:key/dismiss` | — | 204 | — |

  - `partial` is true below 8 tagged pieces.
  - Every write is safe to repeat: the same request twice gives the same state.
- The composer input builder passes `styleProfile` (with no cm) and `wears180` from the wear log.
- Jobs:
  - the weekly learning job runs `updatePreferences` over the last 7 days of `style_events`, adjusts the style multipliers with the same rule and bounds as the existing multiplier job, and is idempotent per user-week (job id from `jobIdFrom`);
  - the retention sweep deletes `style_events` older than 12 months;
  - the Sunday pack mentions one occasion gap only when a coming event has no look.
- Export and delete include measurements, likes, proportions, learned preferences and style events.
- Analytics: only `style_step_completed {likes, tape, photo}` (booleans), `style_read_viewed` and `gap_dismissed {kind}`. The error scrubber drops the measurement, likes, proportions and learned keys.

- [ ] **Step 1: Write the failing tests**
  - repository tests on Postgres;
  - route tests: the normal path, 404 for another user's id, 403 without consent, 400 out of range, the same request twice;
  - `PUT likes rejects a zone in define and cover` and `DELETE body drops body-linked prefs` (Review Focus 5);
  - the job runs once, retries, and dead-letters on final failure;
  - the retention sweep;
  - `analytics payloads carry no values`.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run `checks.sh <tree> worn_style_b2 db api shared worker-<jobs>`.** Expected: PASS.
- [ ] **Step 4: Check on the running API with curl,** per common rules §3.
- [ ] **Step 5: Produce the patch and report.**

---

### Task B3: Mobile screens

**Starts when** B1 is merged. It is checked against B2's API.

**Files** go in the app's router (read `apps/mobile/AGENTS.md` and the Expo SDK 56 docs first):
- the "You" onboarding step at position 5, which can be skipped:
  - height;
  - tape fields with cm and inches, each with a "how to measure" drawing;
  - likes in 3 taps: define, cover and sit;
  - the BODY_PROFILE notice before any number is saved;
  - the photo entry, shown only when `requireOptionalNativeModule('BodyMeasure')` is not null;
- the style read screen at step 9, before the week:
  - three cards: Your colours, What we'll lean towards (with 1–3 cutouts of the user's own pieces), and Gaps;
  - "Change what you like", "How this works" and "See your week";
  - a partial read below 8 tagged pieces;
  - loading, empty and error states;
- Closet → Your style: the same read, plus edit measurements and likes, What Worn has learned with "That's not right", and "Delete my body info" behind a confirm;
- Wardrobe → Gaps, with "I don't want this";
- `styleWhy` under the stylist note on Today and in the Week detail sheet;
- the copy lint extended to every string on these screens (banned words).

- [ ] **Step 1: Write the failing tests:** component tests per screen, covering states, the inch-to-cm conversion, consent gating and the hidden photo entry.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run `checks.sh <tree> worn_style_b3 mobile shared`.** Expected: PASS.
- [ ] **Step 4: Drive the flow on web with playwright against B2's API,** with screenshots: the You step, likes, the style read, styleWhy, gaps, dismiss and delete body info.
- [ ] **Step 5: Produce the patch and report.**

---

### Task C1: The body-measure module and the development build

**Starts when** the owner approves the downloads: expo-dev-client and the ML Kit pose and selfie-segmentation libraries (Android). iOS uses Apple Vision, which ships with the OS. MediaPipe is the hybrid fallback (spec §8.2), built only if the spike calls for it.

**Files:** create `apps/mobile/modules/body-measure/` (Expo Modules API: `expo-module.config.json`, `ios/`, `android/`, `src/index.ts`). Modify `apps/mobile/package.json` (add `expo-dev-client`) and `app.json` (the dev-client plugin).

**Interfaces:**
- Produces:
  - `measureBody(uri: string, heightCm: number): Promise<MeasureResult>`
  - `MeasureResult = { ok: true; measures: PhotoMeasures; shoulderCm: number } | { ok: false; reason: "NO_PERSON" | "MANY_PEOPLE" | "NOT_FULL_BODY" | "NOT_FACING_FRONT" | "UNCLEAR" | "UNSUPPORTED" }`
  - In Expo Go, `requireOptionalNativeModule('BodyMeasure')` returns null.

Steps:
- [ ] Spike first: Apple Vision (iOS) and ML Kit (Android) on 5 consented volunteers, comparing tape ratios, with at least one low-end Android phone. Target: ratios within ±0.05 and 2 s or less. If a phone class misses, bring the MediaPipe backend to the owner with the numbers; otherwise set `photoFills: ["balance","torso"]` and use rough quality.
- [ ] Implement `measureBody` once in TS over a shared joint subset (eyes, nose, shoulders, hips, knees, ankles) plus the outline mask, with a Swift Vision backend and a Kotlin ML Kit backend; the pose and segmentation widths (§8.1 step 3); the temporary file deleted after measuring.
- [ ] Build the development build: `expo prebuild`, then Xcode for the iOS simulator. Measure a library test image in the simulator and record the time.
- [ ] Check the app-size delta is 30 MB or less, and record the Android mid-range timing when a device is available.

### Task C2: The photo flow

**Files:** the photo part of the "You" step:
- take a photo (back camera with a 3 s timer, or front) or pick one from the library;
- the outline guide and tips;
- plain messages for each `reason`;
- the result with edit fields, labelled "From your photo" with "rough" or "good";
- typed tape values win.

- [ ] Write component tests, including the UNSUPPORTED path.
- [ ] Check in the iOS simulator dev build with a library image, and on the owner's phone with the camera.

---

### Task I: Integration and running-app test

- [ ] Apply the patches in wave order with `git apply --3way` onto the integrated tree, and generate the one migration.
- [ ] Run full `checks.sh` over all 13 packages. Expected: RESULT PASS.
- [ ] On the running API, run the B2 curl matrix.
- [ ] On the iOS simulator (the dev build when C1 has landed, otherwise Expo Go without the photo), go through:
  - You;
  - likes;
  - the style read;
  - `styleWhy` on Today and in the Week detail sheet;
  - gaps;
  - dismissing a gap;
  - deleting body info.
- [ ] Run the evaluation set (20 closets × 4 profiles), and report determinism, violations and budgets.
- [ ] List what waits on others:
  - the stylist: the thresholds, the harmony values, the fabric table, and the blind-pair test (target 65%);
  - the owner: the downloads and the volunteer accuracy check;
  - alpha: the swap-rate comparison.
