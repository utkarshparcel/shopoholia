import type * as Crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

// Bytes the next referral codes are made from; empty falls back to real randomness.
const nextBytes = vi.hoisted(() => [] as Buffer[]);

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof Crypto>();
  return {
    ...actual,
    randomBytes: (size: number) => nextBytes.shift() ?? actual.randomBytes(size),
  };
});

const { createMemoryRepositories } = await import("./memory.js");

describe("referral codes on sign-up", () => {
  afterEach(() => {
    nextBytes.length = 0;
  });

  it("gives a new user another code when the first one drawn is taken", async () => {
    const repos = createMemoryRepositories();
    const same = Buffer.alloc(6, 0); // "AAAAAA"
    nextBytes.push(same, same, Buffer.alloc(6, 1));

    const first = await repos.createUser("919876500001");
    const second = await repos.createUser("919876500002");
    expect(first.user.referralCode).toBe("AAAAAA");
    expect(second.isNew).toBe(true);
    expect(second.user.referralCode).toBe("BBBBBB");
    expect((await repos.findUserByReferralCode("AAAAAA"))?.id).toBe(first.user.id);

    nextBytes.push(same, Buffer.alloc(6, 2));
    const google = await repos.findOrCreateGoogleUser({ googleSub: "g-1", email: "a@example.com", displayName: null });
    expect(google.user.referralCode).toBe("CCCCCC");
  });
});
