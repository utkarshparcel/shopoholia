import { randomInt, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMemoryRepositories } from "./memory.js";
import { createPostgresRepositoriesFromUrl } from "./postgres.js";
import type { Repositories } from "./types.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

async function revealOrderStaysPut(repos: Repositories) {
  const listingId = randomUUID();
  const variantId = randomUUID();
  await repos.seedListings(
    [
      {
        id: listingId,
        sellerId: null,
        title: "Order Tee",
        category: `render-order-${listingId.slice(0, 8)}`,
        tags: [],
        coinPrice: 40,
        realPrice: null,
        productImageKeys: [],
        houseModelRenderKey: "house-models/x.jpg",
        affiliateUrl: null,
        affiliateLinks: null,
        status: "ACTIVE",
        sortOrder: 2_000_000_300,
        createdAt: new Date(),
      },
    ],
    [{ id: variantId, listingId, size: "M", color: "Black", garmentImageKey: "garments/x.jpg" }],
  );
  const { user } = await repos.createUser(`9${randomInt(10 ** 10, 10 ** 11)}`);
  const { order, items } = await repos.createOrder({
    userId: user.id,
    tier: "STANDARD",
    coinTotal: 0,
    stateEta: { PROCESSING: new Date().toISOString() },
    items: [0, 1, 2].map(() => ({ listingVariantId: variantId, coinPriceSnapshot: 40, quantity: 1 })),
  });
  const scenarios = ["STUDIO", "STREET", "NIGHT", "CANDID"] as const;
  const created = await repos.createRenders(
    items.flatMap((item) =>
      scenarios.map((scenario) => ({
        orderItemId: item.id,
        scenario,
        imageKey: null,
        isFree: true,
        unlocked: true,
        provider: "mock-fashn",
        status: "QUEUED" as const,
        costMicros: 0,
      })),
    ),
  );
  const first = (await repos.findRendersByOrderId(order.id)).map((render) => render.id);
  // Finishing renders rewrites their rows (in Postgres, new heap positions).
  for (const render of created.filter((_, index) => index % 2 === 0)) {
    await repos.updateRender(render.id, { status: "DONE", imageKey: `reveal/${render.id}.jpg` });
  }
  const after = (await repos.findRendersByOrderId(order.id)).map((render) => render.id);
  expect(after).toEqual(first);
  const records = await repos.findRendersByOrderId(order.id);
  const keys = records.map((render) => `${render.orderItemId}|${render.scenario}`);
  expect(keys).toEqual([...keys].sort());
}

describe("reveal render order (memory)", () => {
  it("is grouped by item and stays put when renders finish", async () => {
    await revealOrderStaysPut(createMemoryRepositories());
  });
});

describePostgres("reveal render order (postgres)", () => {
  it("is grouped by item and stays put when renders finish", async () => {
    await revealOrderStaysPut(createPostgresRepositoriesFromUrl(databaseUrl!));
  });
});
