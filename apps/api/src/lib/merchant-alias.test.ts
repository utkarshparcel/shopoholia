import { describe, expect, it } from "vitest";
import {
  buildUnknownMerchantQueue,
  isUnknownMerchant,
  listMerchantAliases,
  merchantPickerOptions,
  reprocessWindowFields,
  resolveMerchantAlias,
  upsertMerchantAlias,
} from "./merchant-alias.js";
import { createMemoryRepositories } from "./repositories/memory.js";

describe("U042 merchant-alias", () => {
  it("detects unknown merchants", () => {
    expect(isUnknownMerchant(null)).toBe(true);
    expect(isUnknownMerchant("Unknown Merchant")).toBe(true);
    expect(isUnknownMerchant("Myntra")).toBe(false);
  });

  it("stores the alias through the repositories and resolves canonical", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("+919800000301");
    await upsertMerchantAlias(repos, user.id, "myntra  india", "Myntra");
    expect(await resolveMerchantAlias(repos, user.id, "MYNTRA INDIA")).toBe("Myntra");
    expect(await resolveMerchantAlias(repos, user.id, "Ajio")).toBe("Ajio");
    expect(await repos.listMerchantAliases(user.id)).toEqual([
      expect.objectContaining({ alias: "MYNTRA INDIA", canonical: "Myntra" }),
    ]);
    // A repeat replaces the canonical; it doesn't add a row.
    await upsertMerchantAlias(repos, user.id, "Myntra India", "Myntra Fashion");
    expect((await listMerchantAliases(repos, user.id)).map((a) => a.canonical)).toEqual(["Myntra Fashion"]);
  });

  it("keeps each user's aliases to that user", async () => {
    const repos = createMemoryRepositories();
    const { user: a } = await repos.createUser("+919800000302");
    const { user: b } = await repos.createUser("+919800000303");
    await upsertMerchantAlias(repos, a.id, "amzn mktp", "Amazon");
    expect(await resolveMerchantAlias(repos, b.id, "AMZN MKTP")).toBe("AMZN MKTP");
    expect(await merchantPickerOptions(repos, b.id)).not.toContain("Amazon Fresh");
  });

  it("refuses an empty alias or canonical", async () => {
    const repos = createMemoryRepositories();
    await expect(upsertMerchantAlias(repos, "u1", "  ", "Myntra")).rejects.toThrow(/required/);
    await expect(upsertMerchantAlias(repos, "u1", "x", " ")).rejects.toThrow(/required/);
  });

  it("builds unknown queue and reprocesses windows", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("+919800000304");
    const queue = buildUnknownMerchantQueue([
      {
        id: "d1",
        kind: "EMAIL",
        parsedJson: { merchant: "Unknown Merchant" },
        matchedPurchaseId: "p1",
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
      },
      {
        id: "d2",
        kind: "EMAIL",
        parsedJson: { merchant: "Flipkart" },
        matchedPurchaseId: null,
        createdAt: new Date("2026-08-02T00:00:00.000Z"),
      },
    ]);
    expect(queue).toHaveLength(1);
    expect(queue[0]?.documentId).toBe("d1");

    const windows = reprocessWindowFields({
      purchasedAt: new Date("2026-08-01T00:00:00.000Z"),
      merchant: "Flipkart",
    });
    expect(windows.returnWindowDeadline.getTime()).toBeGreaterThan(
      new Date("2026-08-01T00:00:00.000Z").getTime(),
    );
    await upsertMerchantAlias(repos, user.id, "lenskart solutions", "Lenskart");
    const picker = await merchantPickerOptions(repos, user.id);
    expect(picker).toContain("Myntra");
    expect(picker).toContain("Lenskart");
  });
});
