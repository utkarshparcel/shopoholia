import { describe, expect, it } from "vitest";
import { MEASUREMENT_RANGES_CM, PROPORTION_THRESHOLDS, proportionsOf } from "./proportions.js";
import type { PhotoMeasures } from "./proportions.js";

const tape = <V extends string>(value: V) => ({ value, confidence: 1, source: "TAPE" as const });

/** Waist 0.95 of hip (straight), shoulders 1.2 of hip (top wider), torso 0.7 of legs (longer torso). */
const photo = (over: Partial<PhotoMeasures> = {}): PhotoMeasures => ({
  shoulderWidth: 36,
  waistWidth: 28.5,
  hipWidth: 30,
  torsoLength: 56,
  legLength: 80,
  quality: "good",
  ...over,
});

describe("proportionsOf", () => {
  it("proportionsOf from tape", () => {
    expect(proportionsOf({ waistCm: 70, hipCm: 100 }).waist).toEqual(tape("defined"));
    expect(proportionsOf({ waistCm: 80, hipCm: 100 }).waist).toEqual(tape("moderate"));
    expect(proportionsOf({ waistCm: 90, hipCm: 100, bustCm: 100 }).waist).toEqual(tape("straight"));
    expect(proportionsOf({ bustCm: 100, hipCm: 90 }).balance).toEqual(tape("top_wider"));
  });

  it("puts the tape thresholds on the boundaries the table gives", () => {
    expect(proportionsOf({ waistCm: 75, hipCm: 100 }).waist?.value).toBe("defined");
    expect(proportionsOf({ waistCm: 76, hipCm: 100 }).waist?.value).toBe("moderate");
    expect(proportionsOf({ waistCm: 84, hipCm: 100 }).waist?.value).toBe("moderate");
    expect(proportionsOf({ waistCm: 85, hipCm: 100 }).waist?.value).toBe("straight");
    // The smaller ratio counts: 70/100 against 70/80.
    expect(proportionsOf({ waistCm: 70, hipCm: 100, bustCm: 80 }).waist?.value).toBe("defined");
    expect(proportionsOf({ waistCm: 70, bustCm: 100 }).waist?.value).toBe("defined");
    expect(proportionsOf({ bustCm: 105, hipCm: 100 }).balance?.value).toBe("top_wider");
    expect(proportionsOf({ bustCm: 100, hipCm: 100 }).balance?.value).toBe("balanced");
    expect(proportionsOf({ bustCm: 95, hipCm: 100 }).balance?.value).toBe("bottom_wider");
    expect(proportionsOf({ bustCm: 100, hipCm: 100 }).torso).toBeNull();
  });

  it("gives every bucket unknown with no numbers", () => {
    expect(proportionsOf({})).toEqual({ waist: null, balance: null, torso: null });
    expect(proportionsOf({ waistCm: 70 })).toEqual({ waist: null, balance: null, torso: null });
  });

  it("proportionsOf prefers tape over photo", () => {
    const p = proportionsOf({ waistCm: 70, bustCm: 90, hipCm: 100, photo: photo() });
    expect(p.waist).toEqual(tape("defined"));
    expect(p.balance).toEqual(tape("bottom_wider"));
    expect(p.torso).toEqual({ value: "longer_torso", confidence: 0.7, source: "PHOTO" });
  });

  it("photo fills only what tape can't", () => {
    const p = proportionsOf({ bustCm: 100, hipCm: 100, photo: photo() });
    expect(p.balance).toEqual(tape("balanced"));
    expect(p.waist).toEqual({ value: "straight", confidence: 0.7, source: "PHOTO" });
    expect(p.torso?.source).toBe("PHOTO");
  });

  it("reads the photo's own thresholds", () => {
    const at = (over: Partial<PhotoMeasures>) => proportionsOf({ photo: photo(over) });
    expect(at({ waistWidth: 24 }).waist?.value).toBe("defined");
    expect(at({ waistWidth: 25.5 }).waist?.value).toBe("moderate");
    expect(at({ waistWidth: 27 }).waist?.value).toBe("straight");
    expect(at({ shoulderWidth: 33.6 }).balance?.value).toBe("top_wider");
    expect(at({ shoulderWidth: 31.5 }).balance?.value).toBe("balanced");
    expect(at({ shoulderWidth: 29.4 }).balance?.value).toBe("bottom_wider");
    expect(at({ torsoLength: 51.2 }).torso?.value).toBe("longer_torso");
    expect(at({ torsoLength: 48 }).torso?.value).toBe("balanced");
    expect(at({ torsoLength: 43.2 }).torso?.value).toBe("longer_legs");
  });

  it("proportionsOf ignore implausible numbers", () => {
    // Waist 0: only the waist is unknown.
    expect(proportionsOf({ waistCm: 0, bustCm: 100, hipCm: 90 })).toEqual({
      waist: null,
      balance: tape("top_wider"),
      torso: null,
    });
    // Hip 500: balance is unknown, and the waist reads the bust alone.
    expect(proportionsOf({ waistCm: 70, bustCm: 100, hipCm: 500 })).toEqual({
      waist: tape("defined"),
      balance: null,
      torso: null,
    });
    // NaN bust: balance is unknown, and the waist reads the hip alone.
    expect(proportionsOf({ waistCm: 90, bustCm: Number.NaN, hipCm: 100 })).toEqual({
      waist: tape("straight"),
      balance: null,
      torso: null,
    });
    // Negative waist: only the waist is unknown.
    expect(proportionsOf({ waistCm: -70, bustCm: 100, hipCm: 100 })).toEqual({
      waist: null,
      balance: tape("balanced"),
      torso: null,
    });
    // Infinity and null count as missing too.
    expect(proportionsOf({ waistCm: Number.POSITIVE_INFINITY, bustCm: null, hipCm: 100 }).waist).toBeNull();
    // Height in inches by mistake changes nothing.
    expect(proportionsOf({ heightCm: 65, waistCm: 70, hipCm: 100 })).toEqual(proportionsOf({ waistCm: 70, hipCm: 100 }));
    // Every edge of every range.
    for (const [lo, hi] of Object.values(MEASUREMENT_RANGES_CM)) {
      expect(lo).toBeLessThan(hi);
    }
    expect(proportionsOf({ waistCm: 39, hipCm: 100 }).waist).toBeNull();
    expect(proportionsOf({ waistCm: 40, hipCm: 100 }).waist?.value).toBe("defined");
    expect(proportionsOf({ waistCm: 70, hipCm: 191 }).waist).toBeNull();
    expect(proportionsOf({ bustCm: 181, hipCm: 100 }).balance).toBeNull();
  });

  it("treats a photo value that is zero, negative or not finite as missing", () => {
    expect(proportionsOf({ photo: photo({ waistWidth: 0 }) }).waist).toBeNull();
    expect(proportionsOf({ photo: photo({ hipWidth: -30 }) })).toEqual({
      waist: null,
      balance: null,
      torso: { value: "longer_torso", confidence: 0.7, source: "PHOTO" },
    });
    expect(proportionsOf({ photo: photo({ legLength: Number.NaN }) }).torso).toBeNull();
    expect(proportionsOf({ photo: null })).toEqual({ waist: null, balance: null, torso: null });
  });

  it("photoFills limits the photo", () => {
    const p = proportionsOf({ photo: photo() }, { photoFills: ["balance", "torso"] });
    expect(p.waist).toBeNull();
    expect(p.balance?.source).toBe("PHOTO");
    expect(p.torso?.source).toBe("PHOTO");
    expect(proportionsOf({ photo: photo() }, { photoFills: [] })).toEqual({ waist: null, balance: null, torso: null });
    // Tape still fills a bucket the photo may not.
    expect(proportionsOf({ waistCm: 70, hipCm: 100, photo: photo() }, { photoFills: [] }).waist).toEqual(tape("defined"));
  });

  it("photo confidence", () => {
    expect(proportionsOf({ photo: photo({ quality: "good" }) }).waist?.confidence).toBe(0.7);
    expect(proportionsOf({ photo: photo({ quality: "rough" }) }).waist?.confidence).toBe(0.35);
    expect(proportionsOf({ photo: photo({ quality: "rough" }) }).torso?.confidence).toBe(0.35);
    expect(PROPORTION_THRESHOLDS.confidence).toEqual({ tape: 1, good: 0.7, rough: 0.35 });
  });
});
