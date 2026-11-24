import { describe, expect, it } from "vitest";
import {
  buildParserBreakBanner,
  dismissParserBreakBanner,
  listParserBreakFlags,
  setParserBreakFlag,
} from "./parser-break-banner.js";
import { createMemoryRepositories } from "./repositories/memory.js";

describe("U050 parser-break-banner", () => {
  it("shows scanning delayed banner with manual add and no fake credits", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("+919800000311");
    expect((await buildParserBreakBanner(repos, user.id)).visible).toBe(false);
    await setParserBreakFlag(repos, { merchant: "Myntra", broken: true, reason: "parser 5xx" });
    const banner = await buildParserBreakBanner(repos, user.id);
    expect(banner.visible).toBe(true);
    expect(banner.title).toMatch(/scanning delayed/i);
    expect(banner.manualAddLabel).toBe("Add manually");
    expect(banner.inventCredits).toBe(false);
    expect(banner.merchants).toContain("Myntra");

    await dismissParserBreakBanner(repos, user.id, "Myntra");
    expect((await buildParserBreakBanner(repos, user.id)).visible).toBe(false);
  });

  it("keeps flags in the repositories and the dismissal in the user's prefs", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("+919800000312");
    const { user: other } = await repos.createUser("+919800000313");
    const setAt = new Date("2026-11-01T10:00:00.000Z");
    await setParserBreakFlag(repos, { merchant: " Ajio ", broken: true, now: setAt });
    expect(await repos.listParserBreakFlags()).toEqual([
      { merchantKey: "AJIO", merchant: "Ajio", reason: "Merchant parser unhealthy", region: null, setAt },
    ]);
    expect((await listParserBreakFlags(repos)).map((f) => f.merchant)).toEqual(["Ajio"]);

    await dismissParserBreakBanner(repos, user.id);
    expect((await repos.getUserPrefs(user.id))?.dismissedParserBreakMerchants).toEqual([
      `AJIO@${setAt.toISOString()}`,
    ]);
    // Another user still sees it.
    expect((await buildParserBreakBanner(repos, other.id)).merchants).toEqual(["Ajio"]);

    await setParserBreakFlag(repos, { merchant: "Ajio", broken: false });
    expect(await repos.listParserBreakFlags()).toEqual([]);
  });

  it("shows the banner again when the merchant's parser breaks again later", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("+919800000314");
    await setParserBreakFlag(repos, { merchant: "Nykaa", broken: true, now: new Date("2026-11-01T00:00:00Z") });
    await dismissParserBreakBanner(repos, user.id, "nykaa");
    expect((await buildParserBreakBanner(repos, user.id)).visible).toBe(false);
    await setParserBreakFlag(repos, { merchant: "Nykaa", broken: false });
    await setParserBreakFlag(repos, { merchant: "Nykaa", broken: true, now: new Date("2026-11-20T00:00:00Z") });
    expect((await buildParserBreakBanner(repos, user.id)).merchants).toEqual(["Nykaa"]);
  });

  it("dismissing a merchant that isn't flagged stores nothing", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("+919800000315");
    await dismissParserBreakBanner(repos, user.id, "Myntra");
    expect((await repos.getUserPrefs(user.id))?.dismissedParserBreakMerchants).toBeUndefined();
  });
});
