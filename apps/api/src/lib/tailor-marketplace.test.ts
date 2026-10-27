import { describe, expect, it } from "vitest";
import { createMemoryRepositories } from "./repositories/memory.js";
import {
  assignTailorSeller,
  listTailorMarketplace,
  tailorRatingAvg,
} from "./tailor-marketplace.js";

describe("tailor-marketplace", () => {
  it("seeds a default tailor and assigns on order", async () => {
    const repos = createMemoryRepositories();
    const id = await assignTailorSeller(repos, null);
    expect(id).toBeTruthy();
    const seller = await repos.findSellerById(id);
    expect(seller?.sellerType).toBe("TAILOR");
    expect(seller?.shopName).toBe("WORN Studio Tailors");
  });

  it("prefers an explicit active tailor seller id", async () => {
    const repos = createMemoryRepositories();
    const custom = await repos.ensureDefaultTailorSeller("Custom Atelier");
    const assigned = await assignTailorSeller(repos, custom.id);
    expect(assigned).toBe(custom.id);
  });

  it("lists marketplace with review averages", async () => {
    const repos = createMemoryRepositories();
    const list = await listTailorMarketplace(repos);
    expect(list.length).toBeGreaterThan(0);
    const tailor = list[0]!;
    await repos.createTailoringReview({
      sellerId: tailor.id,
      userId: "00000000-0000-4000-8000-000000000001",
      rating: 5,
      comment: "Perfect stitch",
    });
    await repos.createTailoringReview({
      sellerId: tailor.id,
      userId: "00000000-0000-4000-8000-000000000002",
      rating: 4,
    });
    const again = await listTailorMarketplace(repos);
    const updated = again.find((t) => t.id === tailor.id)!;
    expect(updated.reviewCount).toBe(2);
    expect(updated.ratingAvg).toBe(4.5);
  });

  it("computes rating average", () => {
    expect(tailorRatingAvg([])).toBeNull();
    expect(tailorRatingAvg([{ rating: 5 }, { rating: 3 }])).toBe(4);
  });
});
