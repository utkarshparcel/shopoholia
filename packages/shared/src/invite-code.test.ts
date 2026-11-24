import { afterEach, describe, expect, it, vi } from "vitest";
import { generateHouseholdInviteCode } from "./household.js";
import { INVITE_ALPHABET } from "./invite-code.js";
import { generateSwapInviteCode } from "./swap-circle.js";

describe("invite codes", () => {
  afterEach(() => vi.restoreAllMocks());

  it("come from crypto.getRandomValues, not Math.random", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const spy = vi.spyOn(globalThis.crypto, "getRandomValues");
    for (const gen of [generateHouseholdInviteCode, generateSwapInviteCode]) {
      const codes = new Set(Array.from({ length: 20 }, () => gen(8)));
      // Math.random pinned to 0 would give "AAAAAAAA" every time.
      expect(codes.size).toBeGreaterThan(1);
      for (const code of codes) {
        expect(code).toHaveLength(8);
        for (const ch of code) expect(INVITE_ALPHABET).toContain(ch);
      }
    }
    expect(spy).toHaveBeenCalled();
  });

  it("clamps the length to 4–16", () => {
    expect(generateHouseholdInviteCode(2)).toHaveLength(4);
    expect(generateSwapInviteCode(40)).toHaveLength(16);
  });
});
