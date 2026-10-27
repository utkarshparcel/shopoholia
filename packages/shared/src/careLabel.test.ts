import { describe, expect, it } from "vitest";
import {
  careLabelBadge,
  extractOcrPlainText,
  formatCareRulesExpanded,
  parseCareLabel,
} from "./careLabel.js";

/** Representative wash-tag OCR fixtures (N20 acceptance). */
const FIXTURE_COTTON_TEE = `
Machine wash cold 30°C
Non-chlorine bleach when needed
Tumble dry low
Cool iron
Do not dry clean
100% cotton
`.trim();

const FIXTURE_WOOL_SWEATER = `
Hand wash only
Do not bleach
Dry flat
Do not iron
Dry clean petroleum solvent
Wool
`.trim();

const FIXTURE_DRY_CLEAN_ONLY = `
Do not wash
Do not bleach
Do not tumble dry
Do not iron
Dry clean only
Silk
`.trim();

describe("parseCareLabel", () => {
  it("parses cotton tee fixture", () => {
    const rules = parseCareLabel(FIXTURE_COTTON_TEE);
    expect(rules.wash).toBe("machine_cold");
    expect(rules.bleach).toBe("non_chlorine");
    expect(rules.dry).toBe("tumble_low");
    expect(rules.iron).toBe("low");
    expect(rules.dryClean).toBe("do_not_dry_clean");
    expect(rules.notes).toContain("100% cotton");
    expect(rules.confidence).toBeGreaterThan(0.7);
    expect(rules.rawText).toContain("Machine wash cold");
  });

  it("parses wool sweater fixture", () => {
    const rules = parseCareLabel(FIXTURE_WOOL_SWEATER);
    expect(rules.wash).toBe("hand");
    expect(rules.bleach).toBe("do_not_bleach");
    expect(rules.dry).toBe("flat");
    expect(rules.iron).toBe("do_not_iron");
    expect(rules.dryClean).toBe("petroleum");
    expect(rules.notes).toContain("wool");
  });

  it("parses dry-clean-only silk fixture", () => {
    const rules = parseCareLabel(FIXTURE_DRY_CLEAN_ONLY);
    expect(rules.wash).toBe("do_not_wash");
    expect(rules.bleach).toBe("do_not_bleach");
    expect(rules.dry).toBe("do_not_tumble");
    expect(rules.iron).toBe("do_not_iron");
    expect(rules.dryClean).toBe("ok");
    expect(rules.notes).toContain("silk");
  });

  it("returns unknowns for empty / unrelated text", () => {
    const rules = parseCareLabel("hello world");
    expect(rules.wash).toBe("unknown");
    expect(rules.bleach).toBe("unknown");
    expect(rules.dry).toBe("unknown");
    expect(rules.iron).toBe("unknown");
    expect(rules.dryClean).toBe("unknown");
    expect(rules.confidence).toBeLessThan(0.5);
  });
});

describe("extractOcrPlainText", () => {
  it("prefers raw.text then falls back to item titles", () => {
    expect(extractOcrPlainText({ text: "Machine wash cold" })).toBe("Machine wash cold");
    expect(extractOcrPlainText({}, [{ title: "Hand wash" }, { title: "Cool iron" }])).toBe(
      "Hand wash\nCool iron",
    );
  });

  it("reads fullText and lines arrays", () => {
    expect(extractOcrPlainText({ fullText: "  Line dry  " })).toBe("Line dry");
    expect(extractOcrPlainText({ lines: ["Warm iron", 12, "Wash separately"] })).toBe(
      "Warm iron\nWash separately",
    );
    expect(extractOcrPlainText(null)).toBe("");
  });
});

describe("parseCareLabel edge tokens", () => {
  it("parses tumble hot + warm/high iron", () => {
    const rules = parseCareLabel(`
Tumble dry high
Warm iron
Wash separately
`);
    expect(rules.dry).toBe("tumble_hot");
    expect(rules.iron).toBe("medium");
    expect(rules.notes).toContain("wash separately");

    const hot = parseCareLabel("Hot iron only");
    expect(hot.iron).toBe("high");
  });

  it("parses any bleach and line dry", () => {
    const rules = parseCareLabel("Any bleach when needed\nHang dry");
    expect(rules.bleach).toBe("any");
    expect(rules.dry).toBe("line");
  });

  it("parses machine hot, bleach-when-needed, and drip dry", () => {
    const hot = parseCareLabel("Machine wash hot 90°C\nBleach when needed\nDrip dry");
    expect(hot.wash).toBe("machine_hot");
    expect(hot.bleach).toBe("any");
    expect(hot.dry).toBe("line");

    const warm = parseCareLabel("Warm wash 40C");
    expect(warm.wash).toBe("machine_warm");
  });
});

describe("careLabelBadge / formatCareRulesExpanded (W061)", () => {
  it("returns null / dry-clean / wash / line-dry / Care fallbacks", () => {
    expect(careLabelBadge(null)).toBeNull();
    expect(careLabelBadge(undefined)).toBeNull();
    const dryClean = parseCareLabel("Dry clean only");
    expect(careLabelBadge(dryClean)).toBe("Dry-clean");
    const petroleum = parseCareLabel("Dry clean petroleum solvent");
    expect(careLabelBadge(petroleum)).toBe("Dry-clean");
    const cold = parseCareLabel("Machine wash cold");
    expect(careLabelBadge(cold)).toBe("Cold wash");
    const line = parseCareLabel("Do not tumble dry\nDo not wash");
    // do_not_wash wins wash badge before dry fallback
    expect(careLabelBadge(line)).toBe("No wash");
    const lineOnly = {
      wash: "unknown" as const,
      bleach: "unknown" as const,
      dry: "do_not_tumble" as const,
      iron: "unknown" as const,
      dryClean: "unknown" as const,
      notes: [],
    };
    expect(careLabelBadge(lineOnly)).toBe("Line dry");
    const bare = {
      wash: "unknown" as const,
      bleach: "unknown" as const,
      dry: "unknown" as const,
      iron: "unknown" as const,
      dryClean: "unknown" as const,
      notes: [],
    };
    expect(careLabelBadge(bare)).toBe("Care");
    expect(formatCareRulesExpanded(cold)).toMatch(/Wash machine_cold/);
  });
});
