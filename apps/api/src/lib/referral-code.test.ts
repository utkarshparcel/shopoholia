import { describe, expect, it, vi } from "vitest";
import {
  REFERRAL_CODE_ATTEMPTS,
  isReferralCodeCollision,
  newReferralCode,
  withNewReferralCode,
} from "./referral-code.js";

const collision = () =>
  Object.assign(new Error('duplicate key value violates unique constraint "users_referral_code_unique"'), {
    code: "23505",
    constraint_name: "users_referral_code_unique",
  });

describe("referral codes", () => {
  it("are six characters from the unambiguous alphabet, and random", () => {
    const codes = Array.from({ length: 200 }, newReferralCode);
    for (const code of codes) expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(new Set(codes).size).toBeGreaterThan(195);
  });

  it("tells a referral_code unique violation from other errors, also when wrapped", () => {
    expect(isReferralCodeCollision(collision())).toBe(true);
    expect(isReferralCodeCollision(new Error("query failed", { cause: collision() }))).toBe(true);
    expect(
      isReferralCodeCollision(Object.assign(new Error("dup"), { code: "23505", constraint_name: "users_phone_unique" })),
    ).toBe(false);
    expect(isReferralCodeCollision(new Error("connection reset"))).toBe(false);
  });

  it("tries another code when one is taken", async () => {
    const generate = vi.fn().mockReturnValueOnce("TAKEN2").mockReturnValueOnce("TAKEN2").mockReturnValue("FRESH3");
    const write = vi.fn(async (code: string) => {
      if (code === "TAKEN2") throw collision();
      return code;
    });
    await expect(withNewReferralCode(write, generate)).resolves.toBe("FRESH3");
    expect(write).toHaveBeenCalledTimes(3);
  });

  it("gives up after a few collisions and never retries other errors", async () => {
    const taken = vi.fn(async () => {
      throw collision();
    });
    await expect(withNewReferralCode(taken, () => "TAKEN2")).rejects.toMatchObject({ code: "23505" });
    expect(taken).toHaveBeenCalledTimes(REFERRAL_CODE_ATTEMPTS);

    const broken = vi.fn(async () => {
      throw new Error("connection reset");
    });
    await expect(withNewReferralCode(broken)).rejects.toThrow("connection reset");
    expect(broken).toHaveBeenCalledTimes(1);
  });
});
