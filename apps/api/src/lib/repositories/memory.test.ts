import { describe, expect, it } from "vitest";
import { createMemoryRepositories } from "./memory.js";

describe("createMemoryRepositories", () => {
  it("creates and finds users", async () => {
    const repos = createMemoryRepositories();
    const { user, isNew } = await repos.createUser("919876543210");
    expect(isNew).toBe(true);
    expect(await repos.findUserByPhone("919876543210")).toEqual(user);
    expect(await repos.findUserById(user.id)).toEqual(user);
  });

  it("returns existing user on duplicate create", async () => {
    const repos = createMemoryRepositories();
    await repos.createUser("919876543210");
    const second = await repos.createUser("919876543210");
    expect(second.isNew).toBe(false);
  });

  it("manages avatars and OTP", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("919876543210");
    await repos.saveOtp("919876543210", "123456", new Date(Date.now() + 60_000));
    expect(await repos.consumeOtp("919876543210", "123456")).toBe(true);
    expect(await repos.consumeOtp("919876543210", "123456")).toBe(false);

    const avatar = await repos.upsertAvatar({
      userId: user.id,
      referenceImageKey: null,
      sourceUploadKeys: ["a"],
      bodyMeta: {},
      status: "PROCESSING",
    });
    expect(await repos.findAvatarByUserId(user.id)).toEqual(avatar);

    await repos.upsertAvatar({
      userId: user.id,
      referenceImageKey: "ref",
      sourceUploadKeys: [],
      bodyMeta: {},
      status: "READY",
    });
    await repos.deleteAvatarByUserId(user.id);
    expect(await repos.findAvatarByUserId(user.id)).toBeNull();
  });

  it("rejects negative coin grants", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("919876543210");
    await expect(
      repos.grantCoins({ userId: user.id, delta: -10, type: "SPEND_ORDER" }),
    ).rejects.toThrow();
  });

  it("manages refresh tokens", async () => {
    const repos = createMemoryRepositories();
    const expires = new Date(Date.now() + 60_000);
    await repos.saveRefreshToken({ token: "rt", userId: "u1", expiresAt: expires });
    expect(await repos.findRefreshToken("rt")).toBeTruthy();
    await repos.deleteRefreshToken("rt");
    expect(await repos.findRefreshToken("rt")).toBeNull();
  });

  it("expires OTP and refresh tokens", async () => {
    const repos = createMemoryRepositories();
    await repos.saveOtp("919876543210", "123456", new Date(Date.now() - 1));
    expect(await repos.consumeOtp("919876543210", "123456")).toBe(false);

    await repos.saveRefreshToken({
      token: "expired",
      userId: "u1",
      expiresAt: new Date(Date.now() - 1),
    });
    expect(await repos.findRefreshToken("expired")).toBeNull();
  });

  it("throws when updating missing user", async () => {
    const repos = createMemoryRepositories();
    await expect(repos.updateUser("missing", { displayName: "x" })).rejects.toThrow();
  });
});
