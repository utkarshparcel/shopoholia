import { describe, expect, it, vi } from "vitest";
import { createMemoryRepositories } from "../repositories/memory.js";
import { createStubPushService } from "../push/stub.js";
import { CheckoutError, checkoutOrder } from "./checkout.js";

describe("checkoutOrder", () => {
  it("rejects empty cart", async () => {
    const repos = createMemoryRepositories();
    const { user } = await repos.createUser("919876543210");
    await repos.grantCoins({ userId: user.id, delta: 500, type: "GRANT" });

    await expect(
      checkoutOrder(
        {
          repos,
          push: createStubPushService(repos),
          jobQueue: { scheduleOrderLadder: vi.fn() },
        },
        { userId: user.id, tier: "EXPRESS" },
      ),
    ).rejects.toBeInstanceOf(CheckoutError);
  });
});
