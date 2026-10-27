/**
 * Fit vault region packs (WV06-REGION-PACKS).
 * IN is the launch pack; US/UK/GLOBAL extend the same customization_templates schema.
 */

export type RegionPackSeed = {
  region: string;
  garmentType: "BLOUSE" | "KURTI" | "SUIT" | "SAREE" | "LEHENGA" | "SHIRT" | "OTHER";
  name: string;
  optionsSchema: Record<string, string[]>;
};

/** Canonical packs seeded into customization_templates (idempotent by region+name). */
export const REGION_PACK_SEEDS: readonly RegionPackSeed[] = [
  {
    region: "IN",
    garmentType: "BLOUSE",
    name: "Saree Blouse — Classic",
    optionsSchema: {
      neckline: ["Round", "Square", "Boat", "V"],
      sleeve: ["Short", "3/4", "Sleeveless", "Full"],
      pattern: ["Plain", "Embroidered", "Printed"],
      backDesign: ["Plain", "Deep", "Keyhole"],
    },
  },
  {
    region: "IN",
    garmentType: "KURTI",
    name: "Kurti — Everyday",
    optionsSchema: {
      neckline: ["Round", "Mandarin", "V"],
      sleeve: ["Short", "3/4", "Full"],
      length: ["Knee", "Calf", "Ankle"],
      pattern: ["Plain", "Printed", "Chikankari"],
    },
  },
  {
    region: "IN",
    garmentType: "SUIT",
    name: "Suit — Tailored India",
    optionsSchema: {
      neckline: ["Notch Lapel", "Peak Lapel", "Shawl"],
      sleeve: ["Full", "Half", "Sleeveless"],
      pattern: ["Solid", "Pinstripe", "Check"],
      fit: ["Slim", "Regular", "Relaxed"],
    },
  },
  {
    region: "IN",
    garmentType: "OTHER",
    name: "Alterations — Hem & Patching",
    optionsSchema: {
      service: ["Hem", "Tapering", "Patching", "Zip Repair"],
      fabric: ["Cotton", "Silk", "Denim", "Linen"],
      urgency: ["Standard", "Express"],
    },
  },
  // Non-IN packs (architecture Decision #3 — IN is launch, not ceiling)
  {
    region: "US",
    garmentType: "SUIT",
    name: "Suit — US Tailoring",
    optionsSchema: {
      lapel: ["Notch", "Peak", "Shawl"],
      fit: ["Slim", "Modern", "Classic"],
      vent: ["None", "Single", "Double"],
      lining: ["Full", "Half", "Unlined"],
    },
  },
  {
    region: "US",
    garmentType: "OTHER",
    name: "Hemming & Alterations — US",
    optionsSchema: {
      service: ["Hem", "Take In", "Let Out", "Shorten Sleeves", "Rezip"],
      garment: ["Pants", "Dress", "Jacket", "Skirt"],
      urgency: ["Standard", "Same-Day"],
    },
  },
  {
    region: "UK",
    garmentType: "OTHER",
    name: "Alterations — UK High Street",
    optionsSchema: {
      service: ["Hem", "Take In", "Invisible Mend", "Button Replace"],
      garment: ["Trousers", "Dress", "Blazer", "Coat"],
      urgency: ["Standard", "Express"],
    },
  },
  {
    region: "GLOBAL",
    garmentType: "SHIRT",
    name: "Shirt — Global",
    optionsSchema: {
      neckline: ["Spread", "Button-Down", "Mandarin"],
      sleeve: ["Long", "Short", "Rolled"],
      pattern: ["Solid", "Oxford", "Printed"],
    },
  },
] as const;

export function regionPackKey(region: string, name: string): string {
  return `${region.trim().toUpperCase()}::${name.trim()}`;
}

export function missingRegionPacks(
  existing: Array<{ region: string; name: string }>,
): RegionPackSeed[] {
  const have = new Set(existing.map((e) => regionPackKey(e.region, e.name)));
  return REGION_PACK_SEEDS.filter((p) => !have.has(regionPackKey(p.region, p.name)));
}
