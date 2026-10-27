# Closet style engine — design

Status: draft for the owner's review, 2026-10-26. Nothing here is built yet.

The style engine teaches Closet how a look suits the person wearing it: their body and what they like, the colours they wear, and the fabric against the day. It ranks looks made from clothes the user owns, explains them in words about the clothes, and says what is missing from the closet. It never invents a piece and never links to a shop.

It extends the Closet plan (`docs/CLOSET_IMPLEMENTATION_PLAN.md`). Section numbers like "plan §8.4" point there. Where the composer's code names something differently, the code wins.

---

## 1. Decisions

The owner made these on 2026-10-26.

| Question | Decision |
|---|---|
| Where it shows | The first time the user opens Closet, then every week plan, Today and the backups, plus gaps (what's missing) |
| Body information | Tape measurements and a few taps on what they like, plus an optional photo |
| Where the photo is measured | On the phone. The photo is never uploaded. |
| Colour | Learned from the colours the user owns and wears most. No skin or face data. |
| "Trained" | Stylist rules first, tuned per user from their actions. Every action is logged so a model can be trained later on our own data. |
| Who | Womenswear and Indian wear first |
| When | All of it in P1, the photo included |
| The rest | Designed for the best user experience (this document) |

---

## 2. Principles

1. **Clothes, never bodies.** Copy describes what a piece does ("the wrap ties at the waist"), never the body. There are no body-shape names (no "pear", "apple" or "hourglass") and no "flattering", "slimming" or "hide". A test enforces this (§10.3).
2. **What they like leads.** When a like and a proportion rule disagree, the like wins. Proportions only break ties among looks the user would accept anyway.
3. **Rank, never remove.** Style rules change the order of looks that already pass the composer's hard constraints (plan §8.4). They never add a constraint, so a closet that worked before still works.
4. **Every word traces back to data.** Style reasons are rule ids with parameters, turned into words by templates, like every other note (plan §8.5). No model writes text.
5. **Honest about confidence.** A palette learned from 12 pieces says so. A measurement from a photo is marked as from the photo. A rule that depends on an unconfirmed item field doesn't fire.
6. **Optional at every step.** Skipping the body step, the photo or the likes still gives good looks, ranked on colour, fabric and the closet.

---

## 3. The style profile (approved 2026-10-26)

### 3.1 At first open

Onboarding (plan §5.7) gains a step, **"You"**, after the work pattern and calendar and before Add clothes. The whole step can be skipped.

- **Height:** optional. Only needed if they use the photo, to set the scale.
- **Tape measurements:** bust, waist, hip and shoulder width, each optional, each with a small "how to measure" drawing. Units are cm, or inches converted to cm.
- **Photo:** optional. One full-length front photo, taken in the app or picked from the library. It is measured on the phone and thrown away (§8). It fills in whatever wasn't typed, plus shoulder width against hip width and torso length against leg length. The user sees the numbers and can correct them. **Typed numbers always win** over the photo for the same measure.
- **Likes, in 3–4 taps:**
  - what they like to define: waist, shoulders, legs, none;
  - what they'd rather cover: arms, midriff, legs, back, none;
  - how they like things to sit: relaxed, fitted, either.

The new onboarding order is:
1. 18+ declaration
2. city
3. work pattern
4. calendar
5. **You**
6. add clothes
7. triage
8. laundry rules
9. the first plan and **the style read** (§6.1)
10. notifications

### 3.2 What is stored

- **Measurements** go in the existing `measurement_profiles` table (cm, `points`), which tailoring already uses. Each number records where it came from: `TAPE`, `PHOTO` or `EDITED`. The user's own profile is marked `is_self`. Tailoring and the later size check (plan §4.12) reuse the same numbers.
- **A new `style_profiles` row** per user holds:
  - the likes;
  - the proportions worked out from the numbers (§5.2), as buckets with a confidence, never raw cm;
  - the learned preferences (§7);
  - the gaps the user dismissed;
  - a version.
- **No body-shape name** is computed, stored or shown.

### 3.3 Consent and deletion

- **Consent:** a new consent scope, `BODY_PROFILE`, inside the per-purpose consent records the P0 fix round is building (plan §0.3 #39). It covers the measurements, the proportions and measuring the photo on the phone. It has its own short notice in English or Hindi.
- **Withdrawing:** this deletes the numbers on the self profile, the proportions and every learned preference tied to them. Recommendations fall back to likes, colour, fabric and the closet. Likes aren't body data, so they stay until the user clears them.
- **Export and delete:** export includes measurements, likes, proportions, learned preferences and style events. Full delete removes all of them.
- **Never sent:** to analytics, error reports, logs or render prompts (§10).

### 3.4 Women first

Everyone gets the "You" step. Body rules (§5.2) cover the women's rule set: dresses, co-ords, saree with blouse, kurta sets, tops and bottoms. Pieces with no rule in that set are ranked on colour, fabric and the closet, without body rules.

---

## 4. Item attributes the rules need

Most fields already exist in `ItemAttributesSchema` (plan §3.3): colours with hex and share, pattern, materials, silhouette, fit at the waist and hip, neckline, sleeve, coverage, formality and feel.

Add these optional fields. Tagging fills them with a confidence, and existing items fill them on their next retag. The tagging prompt version goes up.

| Field | Values | Why |
|---|---|---|
| `rise` | `high`, `mid`, `low` (bottoms) | Torso and leg proportions |
| `length` | `cropped`, `waist`, `hip`, `thigh`, `knee`, `calf`, `ankle`, `floor` (tops, kurtas, dresses, layers) | Proportions and tucking |
| `volumeAt` | any of `shoulders`, `sleeves`, `hem`, `none` | Balancing top and bottom |

The style rules use the same gate as plan §8.1 for every shape field they read (silhouette, fit, coverage, rise, length and `volumeAt`): a field counts only when the user confirmed it or its confidence is at least 0.8. Otherwise the rule that needs them doesn't fire for that piece. Triage still asks at most one question per piece, and the backups' body fields keep first claim on it.

---

## 5. The rules

### 5.1 How a look is scored

The composer already ranks the looks that pass its hard constraints with weighted soft scores. Its weights today are `harmony`, `forgotten`, `costPerWear`, `variety`, `occasion` and `comfort`, each with a learned multiplier. The style engine adds four terms, each from −1 to 1:

| Term | Level | Reads |
|---|---|---|
| `likes` | piece and look | The user's likes and learned preferences (§7) |
| `proportion` | look | The proportion buckets (§5.2) and the pieces' shape fields |
| `palette` | piece | How close the piece's colours are to the user's palette (§5.3) |
| `fabric` | piece | The fabric against the day's weather and length, and the occasion (§5.4) |

The existing `harmony` term is rebuilt on real colour (§5.3).

Rules for combining them:
- Each term is multiplied by its confidence: the proportion confidence, the palette confidence, and whether the field is confirmed or ≥ 0.8.
- **Likes beat proportions.** When a like and a proportion rule point opposite ways on the same feature (for example, the like is "define the waist" and the rule prefers skimming it), the proportion rule's contribution for that feature is zero.
- The new terms get multipliers in `ComposerSettings.weights` (`likes`, `proportion`, `palette`, `fabric`) with the same bounds as the existing ones, so one odd week can't swing the plan.
- Starting weights: `likes` 1.0, `proportion` 0.5, `palette` 0.5, `fabric` 0.6. These are starting values, versioned with `COMPOSER_VERSION`, to be tuned on the evaluation set (§11).
- With no likes and no measurements, `proportion` is zero and `likes` runs on learned preferences alone (§7). `palette` and `fabric` always apply. The `style_profiles` row is created the first time any of these exist.

### 5.2 Body rules (women first)

**Proportions.** Pure code (`proportions.ts`) turns the numbers into buckets. Each bucket has a confidence: tape numbers give high confidence, photo numbers give the photo's confidence, and a missing number means the bucket is unknown and its rules don't fire.

| Proportion | From tape | From the photo | Buckets |
|---|---|---|---|
| Waist definition | waist ÷ hip, waist ÷ bust | waist width ÷ hip width | defined, moderate, straight |
| Top and bottom balance | bust ÷ hip | shoulder width ÷ hip width | top-wider, balanced, bottom-wider |
| Torso and legs | — | torso length ÷ leg length | longer torso, balanced, longer legs |

When the tape numbers a proportion needs exist, the proportion uses them. The photo fills a proportion only when the tape can't. The thresholds between buckets are starting values in the rule data. A stylist reviews them before P1 exit (§12.3).

**Rules.** Each rule names the garment features that score up for a bucket or a like. Each also gives the reason it emits, which becomes words about the clothes.

| When | Pieces and looks that score up | Reason, as words |
|---|---|---|
| Like: define the waist, or waist definition "defined" with no opposing like | Wrap, belted or tied waist; `fit.waist` defined or fitted; `a_line` or fitted silhouettes | `DEFINES_WAIST`: "The wrap ties at the waist." (a named tie or belt); "The dress is shaped at the waist." (a fit or silhouette match) |
| Waist definition "straight", and no "define the waist" like | Pieces that skim the waist: straight, relaxed, `a_line` from the bust, empire line | `SKIMS_WAIST`: "It falls straight from the shoulder." |
| Top-wider | Volume or flare below (`a_line` or flowy bottoms, wide-leg, anarkali, lehenga); V and scoop necklines; plain shoulders | `VOLUME_BELOW`: "The flare at the hem balances the look." |
| Bottom-wider | Interest above: boat, collar or off-shoulder necklines, `volumeAt` shoulders or sleeves, embroidered tops, with a plainer or darker bottom | `INTEREST_ABOVE`: "The detail sits at the neckline." |
| Longer torso | High-rise bottoms, tucked or cropped tops, kurtas from hip to knee length | `HIGH_RISE`: "A high rise under a short top." / "A high rise under the kurta." |
| Longer legs | Mid-rise bottoms, longer tops, calf-length kurtas | `LONG_TOP`: "The kurta falls past the hip." (a long top or kurta); "A mid rise, sitting below the waist." (a mid rise only) |
| Like: cover arms, midriff, legs or back | Pieces whose coverage covers that zone; looks with a layer that covers it | `COVERS {zone}`: "Elbow sleeves and a high back." |
| Like: relaxed | Relaxed or unstructured fit; fabrics with low cling (§5.4) | `EASY_FIT`: "Loose through the body, in a soft cotton." |
| Like: fitted | Fitted silhouettes; structured fabrics | `CLEAN_LINE`: "A close fit in a fabric that holds its shape." |

Where a rule reads several pieces (balance, tucking, layers), it runs on the whole look.

### 5.3 Colour

**Real colour.** Every colour on an item already has a hex from tagging. Pure code (`colour.ts`, with no dependency) converts it to OKLCH, a perceptual colour space where distances match what people see. A colour counts as **neutral** when its chroma is low. A short list of colours also counts as neutral by rule: denim blue, tan, camel, olive and cream.

**Harmony between two pieces.** This replaces the composer's name-based `harmony`, which falls back to names when a hex is missing. All values are starting values.

| Pair | Score |
|---|---|
| Either one neutral | +0.6 |
| Same hue (within 20°) with clear lightness contrast | +0.8 (tonal) |
| Same hue without contrast | +0.4 |
| Neighbouring hues (20–50°) | +0.6 |
| Opposite hues (150–210°), where one is muted or clearly the smaller share | +0.5 |
| Two strong colours 60–140° apart | −0.6. On festive occasions (formality 4 or more with a festive feel) it is +0.2 instead, since pairs like magenta with orange or green with pink are traditional there. |
| A print and a solid that picks up one of the print's colours | +0.7 |
| Two busy prints | −0.4 |

The composer's "same warmth" note (plan §8.5, "Sage and tan, same warmth") is judged on hue temperature: warm runs from red through yellow, cool from green through blue to violet.

**The palette, learned from the closet** (`palette.ts`, pure, deterministic):
- Each item colour is weighted by its share × (1 + log(1 + wears in the last 180 days)). Colours they own but don't wear count for little.
- Colours are grouped into at most 8 swatches by fixed hue and lightness bins in OKLCH.
- The output is:
  - the swatches with their weights;
  - a lean in words (warm or cool, muted or bright, light or deep);
  - the neutrals they rely on;
  - a confidence.
- **Confidence** (starting values):
  - low: under 10 worn pieces or under 20 wears;
  - high: 30 or more worn pieces and 60 or more wears;
  - medium: anything in between.
- At first open there are no wears yet, so the palette comes from owned colours weighted by share, with low confidence: "From the 14 pieces you've added. It sharpens as you wear things."
- **Score:** how close each piece's main colours are to the palette, times the confidence.
- **Not an echo chamber:** the palette weight is moderate, and the composer's existing boost for forgotten pieces stays. Gap advice (§6.3) suggests at most one step away from the palette: a colour next to a heavy swatch, or a neutral they lack. It never suggests something far from it.

**Metals.** Gold or silver jewellery leans toward warm or cool looks. This has a small weight and only applies to accessories the composer is already choosing.

### 5.4 Fabric

`fabrics.ts` is a table of canonical materials with aliases, used when reading tags:
- **Plant fibres:** cotton, mulmul, khadi, linen, chambray, denim
- **Silks and silk-like:** silk, satin, chiffon, georgette, crepe, organza, net, brocade, banarasi, chanderi
- **Man-made and wool:** rayon or viscose, modal, polyester, nylon, wool
- **Pile and knits:** velvet, jersey or knit, stretch blends
- **Leather:** leather and faux leather
- **Aliases** are mapped to these, for example "art silk" to viscose or polyester, and "mul" to cotton.

Each material gets scores from 1 to 5 for:
- breathability, warmth, drape (structured to fluid) and cling;
- sheen, creasing and care;
- rain (dries fast, or marks with water).

It also gets a formality lean (day, evening, festive).

| Use | Rule |
|---|---|
| Heat | When the day's high is 30 °C or more, breathable fabrics (4 or more) score up, and polyester, satin and velvet score down. Humidity joins when the forecast provider gives it. |
| Rain | When `rainChance` is 0.6 or more, fabrics that dry fast score up. The material's rain score backs up `rainOk` when tagging left it empty. |
| Warmth | The material fills a default warmth range when tagging missed it. |
| Long days (8 hours or more) | Low-crease, breathable fabrics with some stretch score up. |
| Occasion | Sheen and the formality lean are matched to the day: satin, silk, velvet and brocade for evening and festive days; linen, cotton and khadi for day; jersey for casual days. |
| Body likes | Cling 4 or more counts as "sits close" for the relaxed and cover likes. A structured drape counts toward "defines" and "clean line". |
| Blends | The first material listed leads, at weight 0.6, and the rest share the remaining 0.4. |
| Unknown material | A score of 0, never a guess |

Fabric reasons: `BREATHABLE_HEAT` ("Linen and cotton for a 34° day."), `LOW_CREASE_LONG_DAY` ("Crepe won't crease over nine hours.") and `DRIES_FAST` ("Denim stays home; this dries fast.").

### 5.5 How it joins the composer

- **Piece-level terms** (likes, palette, fabric) join the composer's per-piece score. **Look-level terms** (proportion, balance, tucking, harmony) join where a look's score is formed.
- **Input:** an optional `styleProfile` on `ComposeWeekInput`, holding the likes, the proportion buckets with their confidence, the learned preferences and a version. It never holds raw cm.
  - The composer computes the palette itself from the items and wear metrics it already receives, so `inputsHash` covers it.
  - `COMPOSER_VERSION` goes up.
- **A new "why this works" line.** Style and fabric reasons don't enter the existing why-lines and stylist notes. They render into a separate optional line, `styleWhy`, with at most two phrases from the strongest reasons. This keeps the site-parity fixture's lines exactly as they are (plan §8.5).
- **Backups are unchanged** in this design. Their checks keep reading only the confirmed body fields.
- **Budget:** the style terms add 50 ms or less to the composer's 300 ms target for a 300-piece closet (a target, measured by the existing benchmark).

---

## 6. Where the user sees it

### 6.1 First open: the style read

It comes in step 9, once the first plan is composed, on its own screen before the week. Its button is "See your week". It has three cards:

1. **Your colours.** The swatches, then the lean in one line: "Mostly cool and soft, with black and cream as your neutrals." Then the confidence line.
2. **What we'll lean towards.** Up to three lines, each about clothes, each from a like or a proportion. Each shows 1–3 of the user's own pieces as examples (cutouts): "Pieces that define the waist: your green wrap dress and the belted kurta."
   - Without body information, the lines come from likes only.
   - With no likes either, the card is replaced by "Add your measurements any time" and a link to the step.
3. **Gaps.** Up to three (§6.3).

The screen also has:
- **"Change what you like":** opens the likes.
- **"How this works":** a plain sheet. It explains that Worn uses your measurements and likes if you add them, the colours you wear, and fabric against the weather. It also says that a body photo, if they used one, was measured on the phone and then discarded, and that nothing links to a shop.

A closet with fewer than 8 tagged pieces gets a partial read: colours only, plus "Add a few more pieces and we'll read the rest." Every card has loading, empty and error states (plan §11.6).

Later, the same screen lives at **Closet → Your style**, along with the measurements, the likes, what Worn has learned (§6.4) and "Delete my body info".

### 6.2 Week, Today and backups

- Looks are ranked with the style terms (§5.5).
- The `styleWhy` line shows under the stylist note on Today, and in each Week card's detail sheet: "The wrap ties at the waist. Linen for a 34° day."
- Without a style profile, colour and fabric reasons can still appear.

### 6.3 Gaps

What's missing: pieces that would make more good looks possible.

**Kinds**, highest priority first:
1. **Occasion:** an event in the coming week has no look that passes. These come from days the composer marks UNAVAILABLE and backups that say what's missing.
2. **Piece:** a template needs a slot that's missing, for example "no shoes for rain", "nothing to layer on cool mornings" or "no blouse that goes with two of your sarees".
3. **Colour:** "nothing evening-ready in your colours", "no neutral bottom for six printed tops".
4. **Like:** "nothing that defines the waist for office days".

**Each gap has:**
- `what`: a description built from attributes: slot, colour family, key feature. For example, "a navy midi skirt with a defined waist".
- `unlocks`: how many new looks that pass would become possible across the next four weeks of day types. The composer's look builder counts them.
- `why`: one template line.
- `forDate`: for occasion gaps.

**How they're found** (`gaps.ts`, pure, deterministic):
- Build up to 60 candidate pieces from a small grammar: slot × colour family (palette swatches, neighbouring colours, missing neutrals) × key feature.
- Count the looks each would unlock.
- Rank by unlocks and urgency, and return the top 5.
- Budget: 500 ms (target).

**Where they show:**
- the style read (top 3);
- **Wardrobe → Gaps** (top 5);
- **the Sunday pack.** It mentions one occasion gap, and only when an event in the coming week has no look: "Nothing festive fits Saturday's sangeet. Here's the closest." Gaps send no other notifications.

**Never:** shop links, brands or prices. The existing `/wardrobe/missing-pieces` and its affiliate links stay with Play and are not used by Closet.

**Dismiss:** "I don't want this" hides a gap for 90 days and counts as a learning signal.

### 6.4 What Worn has learned

Closet → Your style → **What Worn has learned** lists learned preferences in plain words once they are strong enough to count (§7): "You swap out sleeveless tops on office days", "You keep bright colours for weekends". Each has **"That's not right"**, which resets it. Weight changes stay internal; only preferences about features are shown.

---

## 7. Learning

**Signals** are the ones in plan §8.8:
- swaps (slot, from and to);
- locks and skips;
- confirmed wears and regenerations;
- poll votes;
- gap dismissals (new).

**Two levels:**
1. **Weights.** The weekly job that already adjusts the composer's multipliers within bounds also adjusts `likes`, `proportion`, `palette` and `fabric`.
2. **Feature preferences.** Each user has a preference from −1 to 1 for each pair of day type × feature value, for example office × sleeveless = −0.6.
   - Feature values include colour family, silhouette, sleeve, neckline, length, rise, pattern and fabric.
   - They update weekly as a decaying average.
   - A preference counts only after 3 or more consistent signals.
   - Its effect is bounded, and it feeds the `likes` term.
   - The list is capped at 200 per user and stored on `style_profiles`.

**Logging for a later model.** A new `style_events` table records each composed look the user acts on:
- the context bucket: weekday or weekend, formality, temperature band, rain;
- the pieces' feature values;
- the action: kept, swapped out, swapped in, locked, skipped or worn;
- the composer version.

It holds no measurements, only the proportion buckets, and those only under `BODY_PROFILE` consent. Rows are kept 12 months, then deleted by the retention sweep.

**The later model (not in P1).** A ranker trained on `style_events` could reorder looks that already pass the rules. The rules would still write every note. It needs its own design and the owner's go-ahead, and makes sense once there are enough events. That threshold is set when it's designed.

---

## 8. The photo, measured on the phone

### 8.1 The flow

1. **Take or pick.** The app opens the back camera with a 3-second timer, or the front camera, or picks from the library (`expo-image-picker` is already a dependency). An outline guide shows the pose: full length, arms slightly away from the body, facing front. Tips: fitted clothes, plain background, good light.
2. **Check, on the phone.** There must be exactly one person, the whole body from head to ankles must be visible, the person must face the front with both hips visible, and the landmarks must be clear enough. A failure shows a plain message saying what to fix.
3. **Measure, on the phone.**
   - A body-pose model finds the joints, and a person-segmentation model finds the outline. Apple Vision gives 19 joints and ML Kit 33; the measures use only the joints both have (eyes, nose, shoulders, hips, knees, ankles).
   - **Widths:** shoulder width is the outline's width at the shoulder line. Waist is the narrowest width between the ribs and the hips. Hip is the widest width around the hip landmarks.
   - **Lengths:** torso runs from the shoulder line to the hip line, and leg from the hip line to the ankles.
   - **Scale:** the typed height ÷ the outline's height.
   - These are front widths, not tape circumferences. Waist and hip are stored as their own width measures (`waistWidth`, `hipWidth`) and used only for proportions; they are never converted into circumferences. Shoulder width is a width either way, so the photo can fill the tape's shoulder field.
4. **Show.** The numbers appear with edit fields, labelled "From your photo", with a confidence of "rough" or "good". Typed tape values always win for the same measure. Nothing about body shape is shown.
5. **Discard.** The photo is held in memory only. The camera's temporary file is deleted after measuring. Library photos are read, not copied. Nothing is uploaded.

### 8.2 The module

- **What:** a local Expo module (Expo Modules API) in `apps/mobile/modules/body-measure`, with one interface (`measureBody`) and a backend per platform. The owner's rule (2026-10-26): use what the phone already has wherever it can.
  - **iOS:** Apple Vision, part of the OS (0 MB): `VNDetectHumanBodyPoseRequest` (iOS 14+) and `VNGeneratePersonSegmentationRequest` (iOS 15+). The app's minimum is iOS 16.4 (Expo SDK 56), so every iPhone that can install Worn has both.
  - **Android:** Google ML Kit pose detection (bundled base model) and selfie segmentation. They run on Android 7 (API 24), the app's minimum, and need no Google Play services.
  - **MediaPipe Tasks Vision (hybrid fallback, owner's call):** the owner wants it for lower-end phones. It sits behind the same interface and is built only when the accuracy spike shows a phone class where the built-in backend misses the accuracy or speed target. Until then it is not in the app.
- **Spike:** the plan's spike compares the built-in backends with tape measurements, per platform, and on at least one low-end Android phone.
- **Requirements:** works offline, still-image mode, iOS and Android, an Apache or MIT licence for anything bundled.
- **Targets:** 2 s or less on a mid-range Android phone, and 30 MB or less added to the app.
- **Builds:** it needs `expo-dev-client` and a development build (`expo prebuild`, then Xcode for iOS and Android Studio for Android). Expo Go can't load custom native code.
  - In Expo Go the photo option hides itself (`requireOptionalNativeModule` returns null), and everything else still runs there.
  - Release builds use the EAS profiles (plan §5.8).
- **Downloads** need the owner's OK, with names and sizes: `expo-dev-client`, and the ML Kit pose and selfie-segmentation libraries (Google Maven, fetched by the Android build). iOS needs none. MediaPipe is asked for only if the spike calls for it.
- **Accuracy:** the spike compares photo results with tape measurements on volunteers who consent (the team and the alpha cohort). The target is ratios within ±0.05 of the tape ratios (a target, not a measurement). If the spike misses it, the photo fills only top and bottom balance and torso and legs, at "rough" confidence, which halves their weight.
- **Old phones:** a phone that can't run the module offers tape only.

---

## 9. Contracts

### 9.1 Data (Drizzle; one migration, generated in its task)

| Table | Change |
|---|---|
| `measurement_profiles` | Add `sources jsonb` (per point: `TAPE`, `PHOTO`, `EDITED`), `is_self boolean default false` with a partial unique index on `(user_id) where is_self`, and `updated_at` |
| `style_profiles` (new) | `user_id` (primary key, references users on delete cascade), `likes jsonb`, `proportions jsonb`, `learned jsonb`, `dismissed_gaps jsonb`, `version int`, `consent_record_id` (references consent records), `created_at`, `updated_at` |
| `style_events` (new) | `id`, `user_id` (references users on delete cascade), `outfit_id`, `action` enum, `context jsonb`, `features jsonb`, `composer_version`, `created_at`. Index on `(user_id, created_at)`. Retention: 12 months. |

Item attributes gain the optional `rise`, `length` and `volumeAt` (§4). Materials are mapped to the canonical list when read, so no migration is needed.

### 9.2 API

All routes need auth and check ownership, validate with zod schemas from `packages/shared`, and are safe to repeat.

| Route | Does |
|---|---|
| `GET /closet/style` | The profile: likes, proportion buckets, measurements with their sources, consent state, learned preferences in words |
| `PUT /closet/style/likes` | Replaces the likes |
| `PUT /closet/style/measurements` | Saves measurements with their source, checked against plausible ranges (for example, height 120–220 cm). Needs `BODY_PROFILE` consent. Proportions are recomputed on the server with the shared pure function. |
| `DELETE /closet/style/body` | Withdraws `BODY_PROFILE`: deletes the self measurements, the proportions and the body-linked learned preferences |
| `DELETE /closet/style/learned/:key` | Resets one learned preference |
| `GET /closet/style-read` | Palette, lean, confidence, the "lean towards" lines with example item ids, top 3 gaps |
| `GET /closet/gaps` | Top 5 gaps |
| `POST /closet/gaps/:key/dismiss` | Hides a gap for 90 days |

### 9.3 Shared code (`packages/shared/src/closet-style/`, pure: no I/O, no clock, no randomness)

| File | Contents |
|---|---|
| `colour.ts` | hex to OKLCH, neutrals, hue families, temperature, `harmony` |
| `palette.ts` | `learnPalette(items, metrics)` |
| `fabrics.ts` | The material table and `canonicalMaterial` |
| `proportions.ts` | Numbers to buckets with confidence |
| `rules/women.ts` | The women's rule set, as data |
| `score.ts` | The piece and look terms the composer calls |
| `gaps.ts` | `findGaps` |
| `learn.ts` | The weekly update of feature preferences |

The new reason ids and their templates go in `closet-notes.ts`, next to the existing ones.

### 9.4 Mobile

- The onboarding step "You": a measurement form, the photo capture and result, the likes.
- The style read screen.
- Closet → Your style: edit, what Worn has learned, "Delete my body info".
- Wardrobe → Gaps.
- `styleWhy` on Today and in the Week detail sheet.
- The local module `modules/body-measure`.

---

## 10. Privacy, consent and copy

### 10.1 Consent

- `BODY_PROFILE` covers the measurements, the proportions and measuring the photo on the phone.
- The in-app notice says what is collected and why, that the photo is measured on the phone and not uploaded, and how to delete.
- Learning from actions falls under the Closet notice's personalisation purpose.

### 10.2 Analytics and errors

Only these events, with no values:
- `style_step_completed` with which parts were done (likes, tape, photo) as booleans;
- `style_read_viewed`;
- `gap_dismissed` with its kind.

Measurements, likes, proportions and learned preferences never reach analytics or error reports. Error reports scrub them.

### 10.3 Copy rules

- A test runs over every template in `closet-notes.ts` and every string on the style screens. It fails on banned words: flattering, unflattering, slimming, hide, flaw, problem area, figure, apple, pear, hourglass, rectangle, inverted triangle, plus-size, camouflage.
- The test also fails if a template names a body part as the subject. Body parts may appear only as where a garment sits ("ties at the waist").

### 10.4 The site

Nothing on the site changes until P1 ships. After that, the owner may add a line to the closet page in the site worktree, along the lines of "Looks use your measurements and what you like, if you add them." The site's existing rule stands: it makes no general claim that photos stay on the phone.

---

## 11. Testing and done

Done follows plan §11.6 and the fix-wave rule: tested on the running app.

- **Unit tests:**
  - every rule;
  - colour conversion against known values;
  - harmony cases, the festive one included;
  - palette determinism and confidence;
  - fabric aliases;
  - proportions with missing numbers;
  - gap unlock counts;
  - the bounds on learning.
- **Property tests:**
  - With and without a style profile, the set of looks that pass the hard constraints is identical. Style changes only the order.
  - Likes beat proportions when they disagree.
  - The same input gives the same output.
- **Site parity:** the fixture (plan §6.14) still produces every site line exactly. The new harmony may change which looks win. If it does, tune the starting values first. Change the site example only if the line can't be produced honestly (plan §8.5).
- **Evaluation:**
  - The 20 synthetic closets (plan §8.8) each run under four profiles: none, likes only, tape, and tape with photo. CI checks determinism, no violations and the time budgets.
  - A stylist compares blind pairs (with and without the style terms) for 10 profiles over 7 days. Target: the style version is preferred in at least 65% of pairs (a target).
  - In alpha, the swap rate (plan §8.8) is compared between users with and without a profile.
- **Copy test** (§10.3).
- **Running app:**
  - The API routes with curl: the normal path, one error path (another user's id gives 404, missing consent gives 403) and the same request twice.
  - The app on the development build in the iOS simulator:
    - the "You" step with typed numbers;
    - the photo from a library test image (the simulator has no camera);
    - likes, the style read, `styleWhy`, gaps, dismissing a gap, deleting body info.
  - The Android emulator.
  - The camera path on the owner's own phone.
- **Time budgets** (targets): the style terms add 50 ms or less to the composer, gaps take 500 ms or less, and the photo measure takes 2 s or less on a mid-range Android phone.

---

## 12. Phase, effort and dependencies

### 12.1 Phase

All of it is in P1 (owner decision). It depends on:
- the P0 fix round: per-purpose consent records, time zones, prefs;
- the composer landing;
- tagging that returns hex colours, materials and the new optional fields;
- worker-vision.

### 12.2 Effort

These are estimates, to be refined in the implementation plan.

| Piece | Engineer-weeks |
|---|---|
| Rules, colour, palette, fabric, scoring, gaps | 4–6 |
| Style profile, style read, gaps and learned screens | 3–4 |
| The photo module, the development build and its spike | 3–5 |
| Learning and style events | 1–2 |
| **Total** | **11–17** |

A stylist is also needed for 1–2 weeks to review the rule set and its thresholds. With two engineers, P1 grows by about 6–9 weeks, which moves its end from around 2027-03-01 to between mid-April and early May 2027. Every later phase moves by the same amount.

### 12.3 Needed from the owner, without blocking the build

- **Downloads:** approval for `expo-dev-client` and the ML Kit libraries (§8.2), with names and sizes; MediaPipe only if the spike calls for it.
- **A stylist:** to review `rules/women.ts`, the bucket thresholds and the harmony values before P1 exit. Until then they are marked as starting values.

---

## 13. Risks

| Risk | Answer |
|---|---|
| Body advice feels judging | Copy rules and their test, likes lead, no shape names, "Delete my body info" one tap away |
| The palette repeats habits | A moderate weight, the forgotten-pieces boost, gaps one step from the palette |
| Photo accuracy in loose clothes | The pose and outline checks, "rough" confidence at half weight, tape always wins |
| The development build slows everyday testing | The module is optional, so Expo Go still runs everything else |
| Tagging misses shape fields | Rules don't fire below 0.8 confidence. Triage's one question, and the user can edit. |
| The new harmony changes the parity fixture | Tune the starting values. Change the site example only as plan §8.5 allows. |
| Colour customs differ (white or black at weddings) | No hard rules for them. Only the festive pairing allowance is built in; users teach the rest through swaps. |
