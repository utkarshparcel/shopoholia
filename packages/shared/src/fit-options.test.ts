import { describe, expect, it } from "vitest";
import {
  buildRichOptions,
  defaultSelectionsFromSchema,
  garmentKeyForSelections,
  parseOptionsSchema,
  slugifyFitOption,
} from "./fit-options.js";

describe("fit-options", () => {
  it("slugifies option labels for image keys", () => {
    expect(slugifyFitOption("3/4")).toBe("3-4");
    expect(slugifyFitOption("Notch Lapel")).toBe("notch-lapel");
  });

  it("builds rich options with preview assets", () => {
    const rich = buildRichOptions({
      neckline: ["Round", "Boat"],
      sleeve: ["Short", "Full"],
    });
    expect(rich.neckline?.label).toBe("Neckline");
    expect(rich.neckline?.options).toHaveLength(2);
    expect(rich.neckline?.options[0]).toMatchObject({
      value: "Round",
      label: "Round",
      imageKey: "fit/neckline/round.jpg",
      preview: "preview:neckline:Round",
    });
    expect(rich.sleeve?.options[1]?.imageKey).toBe("fit/sleeve/full.jpg");
  });

  it("parses legacy string[] schema into preview pickers", () => {
    const parsed = parseOptionsSchema({
      neckline: ["Round", "V"],
      pattern: ["Plain", "Embroidered"],
    });
    expect(parsed.neckline?.options.map((o) => o.value)).toEqual(["Round", "V"]);
    expect(parsed.pattern?.options[1]?.preview).toBe("preview:pattern:Embroidered");
    expect(parsed.pattern?.options[1]?.imageKey).toBe("fit/pattern/embroidered.jpg");
  });

  it("parses rich schema preserving imageKey/preview", () => {
    const rich = buildRichOptions({ sleeve: ["Short", "3/4"] });
    const parsed = parseOptionsSchema(rich as Record<string, unknown>);
    expect(parsed.sleeve?.options[1]?.imageKey).toBe("fit/sleeve/3-4.jpg");
    expect(parsed.sleeve?.label).toBe("Sleeve");
  });

  it("defaults selections and resolves garment key", () => {
    const schema = parseOptionsSchema({
      neckline: ["Boat", "Round"],
      sleeve: ["Short"],
    });
    expect(defaultSelectionsFromSchema(schema)).toEqual({
      neckline: "Boat",
      sleeve: "Short",
    });
    expect(garmentKeyForSelections(schema, { neckline: "Round" })).toBe(
      "fit/neckline/round.jpg",
    );
  });

  it("handles null schema, mixed choice arrays, and missing selection keys", () => {
    expect(parseOptionsSchema(null)).toEqual({});
    expect(parseOptionsSchema(undefined)).toEqual({});
    const mixed = parseOptionsSchema({
      sleeve: [{ value: "Short", label: "Short sleeve" }, 12, "Full"],
      junk: { label: "Empty", options: [] },
      fabric: { options: [{ value: "Silk", label: "Silk" }] },
      length: { label: "Length", options: ["Knee", { value: "Maxi", label: "Maxi" }] },
    });
    expect(mixed.sleeve?.options.map((o) => o.value)).toEqual(["Short", "Full"]);
    expect(mixed.fabric?.label).toBe("Fabric");
    expect(mixed.length?.options.map((o) => o.value)).toEqual(["Knee", "Maxi"]);
    expect(mixed.length?.options[0]?.imageKey).toBe("fit/length/knee.jpg");
    expect(garmentKeyForSelections(mixed, { missing: "x" })).toBe(
      mixed.sleeve?.options[0]?.imageKey ?? null,
    );
    expect(garmentKeyForSelections({}, {})).toBeNull();

    // Array of choices without imageKey/preview → derived defaults
    const derived = parseOptionsSchema({
      color: [{ value: "Red", label: "Red" }],
    });
    expect(derived.color?.options[0]?.imageKey).toBe("fit/color/red.jpg");
    expect(derived.color?.options[0]?.preview).toBe("preview:color:Red");

    // Array choices with explicit imageKey/preview
    const explicit = parseOptionsSchema({
      neckline: [
        {
          value: "Scoop",
          label: "Scoop",
          imageKey: "custom/scoop.jpg",
          preview: "preview:custom:Scoop",
        },
      ],
      sleeve: {
        label: "Sleeve length",
        options: [
          {
            value: "Cap",
            label: "Cap",
            imageKey: "custom/cap.jpg",
            preview: "preview:custom:Cap",
          },
        ],
      },
    });
    expect(explicit.neckline?.options[0]?.imageKey).toBe("custom/scoop.jpg");
    expect(explicit.sleeve?.options[0]?.preview).toBe("preview:custom:Cap");
  });
});
