import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as schema from "./schema/index.js";
import {
  avatarStatusEnum,
  coinLedgerTypeEnum,
  orderStateEnum,
  orderTierEnum,
  renderScenarioEnum,
} from "./schema/enums.js";

const root = dirname(fileURLToPath(import.meta.url));

describe("schema exports", () => {
  it("exports all core tables", () => {
    expect(schema.users).toBeDefined();
    expect(schema.avatars).toBeDefined();
    expect(schema.listings).toBeDefined();
    expect(schema.sellers).toBeDefined();
    expect(schema.orders).toBeDefined();
    expect(schema.coinLedger).toBeDefined();
    expect(schema.renders).toBeDefined();
  });
});

describe("enums", () => {
  it("defines avatar status values", () => {
    expect(avatarStatusEnum.enumValues).toContain("READY");
  });

  it("defines order lifecycle values", () => {
    expect(orderStateEnum.enumValues).toContain("REVEAL_READY");
    expect(orderTierEnum.enumValues).toContain("EXPRESS");
  });

  it("defines coin ledger and render enums", () => {
    expect(coinLedgerTypeEnum.enumValues).toContain("GRANT");
    expect(renderScenarioEnum.enumValues).toContain("STUDIO");
  });
});

describe("migrations", () => {
  it("includes init migration with core tables", () => {
    const sql = readFileSync(join(root, "../migrations/0000_init.sql"), "utf8");
    expect(sql).toContain('CREATE TABLE "users"');
    expect(sql).toContain('CREATE TABLE "avatars"');
    expect(sql).toContain('CREATE TABLE "coin_ledger"');
    expect(sql).toContain('CREATE TABLE "orders"');
  });

  it("includes sellers migration", () => {
    const sql = readFileSync(join(root, "../migrations/0001_sellers.sql"), "utf8");
    expect(sql).toContain('CREATE TABLE "sellers"');
    expect(sql).toContain("listings_seller_id_sellers_id_fk");
  });
});

describe("grantCoins", () => {
  it("is exported from queries", async () => {
    const mod = await import("./queries/coins.js");
    expect(mod.grantCoins).toBeTypeOf("function");
    expect(mod.getCoinBalance).toBeTypeOf("function");
  });
});

describe("createDb", () => {
  it("is exported from client", async () => {
    const mod = await import("./client.js");
    expect(mod.createDb).toBeTypeOf("function");
  });
});
