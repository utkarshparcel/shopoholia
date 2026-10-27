# Parser-accuracy spike (B3 / §8)

Reusable harness that measures how well the ingestion parser framework
(`src/parsers/`) recognizes real purchase receipts, **before** we invest in
deep per-merchant extraction. This gates downstream accuracy work.

## Approach

- The parser framework is a `ParserRegistry` of `MerchantParser` implementations.
  Dedicated parsers for the top-5 merchants (Amazon, Flipkart, Myntra, Swiggy,
  Zomato) are tried first; an always-on `GenericHeuristicParser` is the fallback.
- Every message produces a `CoverageEvent` through an injected `MetricsSink`
  (see `src/parsers/metrics.ts`). A **hit** = a dedicated merchant parser matched
  a message; a **miss** = only the generic parser matched, or nothing matched at
  all.
- `run.ts` loads every `.eml` in `fixtures/`, runs the registry, and prints a
  coverage report. It is pure and easy to extend: drop a real `.eml` file into
  `fixtures/` and re-run.

## Run it

```bash
pnpm --filter @worn/worker-ingest spike
pnpm --filter @worn/worker-ingest spike:check  # threshold gate for CI (coverage ≥80%, grand-total ≥90%)
# or
pnpm --filter @worn/worker-ingest test   # also exercises the framework
```

## CI gate (Track 1 P1)

`check.ts` enforces the launch-gate thresholds referenced in `docs/UNIVERSE_TODO.md` Track 1 P1:

- **Coverage** (specific-merchant hits / purchase fixtures) ≥ **80%**
- **Grand-total accuracy** (correct `totalMinor` vs `EXPECTED_TOTALS` in `check.ts`) ≥ **90%**
- Also checks currency detection (`EXPECTED_CURRENCY`) and that `merchant_purchase_items` are populated (see `src/parsers/accuracy.test.ts`).

It is wired into `.github/workflows/ci.yml` as `Parser-accuracy threshold check` and will fail the job if thresholds are not met:

```bash
pnpm --filter @worn/worker-ingest spike:check
```

## Fixtures — IMPORTANT

The `.eml` files under `fixtures/` are **synthetic stand-ins**, hand-written to
resemble real purchase receipts (sender domains, order-id patterns, `₹` totals).
They are NOT a real inbox and will overstate confidence. They exist to prove the
harness wiring and to give a first-order signal.

## Measured coverage (synthetic fixtures)

Current run over the bundled fixtures (post Track 1 P1 fixes):

| Metric | Value |
|---|---|
| Fixtures | 7 (purchase: 6 + promo: 1) |
| Specific-merchant hits | 5 |
| Misses (generic/unmatched) | 2 |
| **Coverage (specific / total)** | **~71.4%** (via `run.ts`) |
| **Coverage (specific / purchase)** | **~83.3%** (via `check.ts`, threshold ≥80%) |
| **Grand-total accuracy** | **100%** (threshold ≥90%) |
| **Currency accuracy** | **100%** |

Per-parser: amazon, flipkart, myntra, swiggy, zomato each matched 1 fixture.
The 2 misses are by design:
- `generic-receipt.eml` (BigBasket) — no dedicated parser yet → generic fallback.
- `unknown-promo.eml` — a promotional email, correctly treated as a non-receipt.

## What a real seed inbox is needed for

- **True accuracy numbers.** Synthetic fixtures are crafted to match; they hide
  the long tail of real formatting, multilingual text, forwards, and HTML-only
  receipts. A real seed inbox (consent-scoped Gmail export / `.eml` dump) is the
  only way to measure true parser accuracy and to prioritize which merchants
  deserve deep extraction.
- **Tuning the generic parser.** Real noise tells us the false-positive rate of
  the heuristic fallback (promotions misclassified as receipts).
- **Extraction quality.** Coverage only measures *detection*; item-level and
  total extraction accuracy needs real samples per merchant.

**Next step:** wire `B2` (EmailConnector) to land a real seed inbox, then re-run
this harness to get a trustworthy coverage number that gates B3 investment.
