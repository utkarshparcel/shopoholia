import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../index.js";
import { createMemoryRepositories } from "../lib/repositories/memory.js";
import { createMockStorage } from "../lib/storage/r2.js";

type App = Awaited<ReturnType<typeof buildServer>>;

async function login(app: App, phone = "919876543210") {
  await app.inject({ method: "POST", url: "/auth/otp", payload: { phone } });
  const verify = await app.inject({
    method: "POST",
    url: "/auth/verify",
    payload: { phone, otp: "123456" },
  });
  const { accessToken } = verify.json() as { accessToken: string };
  const me = await app.deps.repos.findUserByPhone(phone);
  return { headers: { authorization: `Bearer ${accessToken}` }, userId: me!.id };
}

function putTimeZone(app: App, headers: Record<string, string>, payload: unknown) {
  return app.inject({ method: "PUT", url: "/me/time-zone", headers, payload: payload as object });
}

describe("PUT /me/time-zone", () => {
  let app: App;

  beforeEach(async () => {
    app = await buildServer({
      logger: false,
      deps: { repos: createMemoryRepositories(), storage: createMockStorage() },
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it("defaults new users to Asia/Kolkata", async () => {
    const { userId } = await login(app);
    expect((await app.deps.repos.findUserById(userId))?.timeZone).toBe("Asia/Kolkata");
  });

  it("stores a valid name and is idempotent", async () => {
    const { headers, userId } = await login(app);
    const first = await putTimeZone(app, headers, { timeZone: "America/New_York" });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ timeZone: "America/New_York" });

    const again = await putTimeZone(app, headers, { timeZone: "America/New_York" });
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual({ timeZone: "America/New_York" });
    expect((await app.deps.repos.findUserById(userId))?.timeZone).toBe("America/New_York");
  });

  it("rejects names Intl doesn't know with 400 invalid_time_zone and keeps the old value", async () => {
    const { headers, userId } = await login(app);
    for (const timeZone of ["Mars/Olympus_Mons", "+05:30", "../etc/passwd"]) {
      const res = await putTimeZone(app, headers, { timeZone });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: "invalid_time_zone" });
    }
    expect((await app.deps.repos.findUserById(userId))?.timeZone).toBe("Asia/Kolkata");
  });

  it("rejects a malformed body with 400", async () => {
    const { headers } = await login(app);
    expect((await putTimeZone(app, headers, {})).statusCode).toBe(400);
    expect((await putTimeZone(app, headers, { timeZone: "" })).statusCode).toBe(400);
    expect((await putTimeZone(app, headers, { timeZone: "A/" + "b".repeat(70) })).statusCode).toBe(400);
  });

  it("requires auth", async () => {
    const res = await putTimeZone(app, {}, { timeZone: "UTC" });
    expect(res.statusCode).toBe(401);
  });

  it("doesn't touch other user fields", async () => {
    const { headers, userId } = await login(app);
    await app.deps.repos.updateUser(userId, { consentFlags: { EMAIL: true } });
    await app.deps.repos.patchUserPrefs(userId, { emailConnected: true });
    await putTimeZone(app, headers, { timeZone: "Europe/London" });
    const user = await app.deps.repos.findUserById(userId);
    expect(user?.consentFlags).toEqual({ EMAIL: true });
    expect(user?.prefs).toEqual({ emailConnected: true });
  });
});
