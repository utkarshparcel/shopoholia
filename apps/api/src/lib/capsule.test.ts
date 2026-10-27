import { describe, expect, it } from "vitest";
import {
  applyCapsulePreference,
  CAPSULE_CONSENT_KEY,
  CAPSULE_SCORE_BOOST,
  isCapsuleMember,
  normalizeCapsuleItemIds,
  preferCapsulePool,
  readCapsuleItemIds,
  withCapsuleInConsent,
} from "./capsule.js";

describe("capsule membership", () => {
  it("normalizes ids: dedupe, drop empties, respect max N", () => {
    const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    expect(normalizeCapsuleItemIds([a, a, "", b, b], 12)).toEqual([a, b]);
    expect(normalizeCapsuleItemIds([a, b, "cccccccc-cccc-4ccc-8ccc-cccccccccccc"], 2)).toEqual([
      a,
      b,
    ]);
  });

  it("isCapsuleMember checks membership", () => {
    const ids = ["a", "b"];
    expect(isCapsuleMember("a", ids)).toBe(true);
    expect(isCapsuleMember("c", ids)).toBe(false);
    expect(isCapsuleMember("b", new Set(ids))).toBe(true);
  });

  it("reads/writes capsule via consentFlags without clobbering", () => {
    const flags = withCapsuleInConsent({ emailConnected: true }, ["id1", "id2"], 5);
    expect(flags.emailConnected).toBe(true);
    expect(flags[CAPSULE_CONSENT_KEY]).toEqual(["id1", "id2"]);
    expect(readCapsuleItemIds(flags)).toEqual(["id1", "id2"]);
    expect(readCapsuleItemIds({})).toEqual([]);
    expect(readCapsuleItemIds(null)).toEqual([]);
  });

  it("preferCapsulePool restricts when members exist", () => {
    const pool = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const restricted = preferCapsulePool(pool, ["a", "c"]);
    expect(restricted.restricted).toBe(true);
    expect(restricted.pool.map((p) => p.id)).toEqual(["a", "c"]);
    expect(restricted.memberCount).toBe(2);

    const fallback = preferCapsulePool(pool, ["z"]);
    expect(fallback.restricted).toBe(false);
    expect(fallback.pool).toEqual(pool);
  });

  it("applyCapsulePreference boosts members and re-sorts", () => {
    const scored = [
      { item: { id: "out" }, score: 10 },
      { item: { id: "in" }, score: 5 },
    ];
    const { scored: next, preferredCount, whyHint } = applyCapsulePreference(
      scored,
      ["in"],
    );
    expect(preferredCount).toBe(1);
    expect(whyHint).toMatch(/capsule/i);
    expect(next[0]!.item.id).toBe("in");
    expect(next[0]!.score).toBe(5 + CAPSULE_SCORE_BOOST);
  });
});
