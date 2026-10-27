import { describe, expect, it } from "vitest";
import { ConsentGrantSchema, GrantConsentBodySchema } from "./schemas/consent.js";
import {
  MoneyAccountSchema,
  MoneyLedgerEntrySchema,
  PostMoneyLedgerBodySchema,
} from "./schemas/money.js";
import {
  IngestionSourceSchema,
  RegisterIngestionSourceBodySchema,
  CorrectIngestionDocumentBodySchema,
  IngestionActivityItemSchema,
  PatchIngestionSourceBodySchema,
} from "./schemas/ingestion.js";
import {
  IngestPurchaseBodySchema,
  MerchantPurchaseSchema,
  MergePurchasesBodySchema,
  SplitPurchaseBodySchema,
} from "./schemas/purchases.js";
import {
  ConfirmReceiptBodySchema,
  PatchReceiptBodySchema,
  ReceiptParsedSchema,
  ReceiptResponseSchema,
} from "./schemas/receipt.js";
import {
  CreateWardrobeItemBodySchema,
  CreateWearBodySchema,
  UpdateWardrobeItemBodySchema,
  WardrobeItemSchema,
} from "./schemas/wardrobe.js";
import { normalizeWishlist } from "./schemas/gift.js";
import { CashbackClickBodySchema } from "./schemas/cashback.js";

const UUID = "00000000-0000-0000-0000-000000000001";
const ISO = "2024-01-01T00:00:00.000Z";

describe("consent schemas", () => {
  it("accepts a valid grant", () => {
    const g = ConsentGrantSchema.parse({
      id: UUID,
      userId: UUID,
      scope: "EMAIL",
      grantedAt: ISO,
      revokedAt: null,
      source: "oauth",
      meta: null,
    });
    expect(g.scope).toBe("EMAIL");
  });

  it("rejects an unknown scope", () => {
    expect(() =>
      ConsentGrantSchema.parse({
        id: UUID,
        userId: UUID,
        scope: "NOPE",
        grantedAt: ISO,
        revokedAt: null,
        source: "oauth",
        meta: null,
      }),
    ).toThrow();
  });

  it("requires a non-empty source on grant", () => {
    expect(() =>
      GrantConsentBodySchema.parse({ userId: UUID, scope: "EMAIL", source: "" }),
    ).toThrow();
    expect(
      GrantConsentBodySchema.parse({
        userId: UUID,
        scope: "FINANCIAL",
        source: "manual",
      }).source,
    ).toBe("manual");
  });
});

describe("money schemas", () => {
  it("accepts a valid account with non-negative balance", () => {
    const a = MoneyAccountSchema.parse({
      id: UUID,
      userId: UUID,
      kind: "GIFT_CARD",
      merchant: "Amazon",
      currency: "INR",
      balanceCacheMinor: 0,
      expiresAt: null,
      status: "ACTIVE",
      link: "https://www.amazon.in/?tag=shopoholia-21",
    });
    expect(a.kind).toBe("GIFT_CARD");
    expect(a.link).toContain("amazon.in");
  });

  it("allows omitting link", () => {
    const a = MoneyAccountSchema.parse({
      id: UUID,
      userId: UUID,
      kind: "STORE_CREDIT",
      merchant: "Local",
      currency: "INR",
      balanceCacheMinor: 100,
      expiresAt: null,
      status: "ACTIVE",
      link: null,
    });
    expect(a.link).toBeNull();
  });

  it("accepts loyalty points and promo credit kinds", () => {
    for (const kind of ["LOYALTY_POINTS", "PROMO_CREDIT"] as const) {
      const a = MoneyAccountSchema.parse({
        id: UUID,
        userId: UUID,
        kind,
        merchant: "Brand",
        currency: "INR",
        balanceCacheMinor: 100,
        expiresAt: null,
        status: "ACTIVE",
      });
      expect(a.kind).toBe(kind);
    }
  });

  it("rejects a negative cached balance", () => {
    expect(() =>
      MoneyAccountSchema.parse({
        id: UUID,
        userId: UUID,
        kind: "CASH",
        merchant: "x",
        currency: "INR",
        balanceCacheMinor: -1,
        expiresAt: null,
        status: "ACTIVE",
      }),
    ).toThrow();
  });

  it("requires a known ledger type", () => {
    expect(() =>
      MoneyLedgerEntrySchema.parse({
        id: UUID,
        userId: UUID,
        delta: 100,
        type: "BOGUS",
        refType: null,
        refId: null,
        balanceAfter: 100,
        createdAt: ISO,
      }),
    ).toThrow();
  });

  it("validates the post-ledger body", () => {
    const b = PostMoneyLedgerBodySchema.parse({
      accountId: UUID,
      userId: UUID,
      delta: -50,
      type: "SPEND",
    });
    expect(b.type).toBe("SPEND");
    expect(() =>
      PostMoneyLedgerBodySchema.parse({
        accountId: "not-uuid",
        userId: UUID,
        delta: 1,
        type: "DEPOSIT",
      }),
    ).toThrow();
  });
});

describe("ingestion schemas", () => {
  it("accepts a valid source registration", () => {
    const s = RegisterIngestionSourceBodySchema.parse({
      kind: "EMAIL",
      provider: "gmail",
      consentGrantId: UUID,
    });
    expect(s.provider).toBe("gmail");
  });

  it("rejects an empty provider", () => {
    expect(() =>
      RegisterIngestionSourceBodySchema.parse({
        kind: "SMS",
        provider: "",
        consentGrantId: UUID,
      }),
    ).toThrow();
  });

  it("validates an ingestion source shape", () => {
    expect(
      IngestionSourceSchema.parse({
        id: UUID,
        kind: "EMAIL",
        provider: "gmail",
        consentGrantId: UUID,
        status: "IDLE",
        cursor: null,
        lastSyncAt: null,
      }).status,
    ).toBe("IDLE");
    expect(
      IngestionSourceSchema.parse({
        id: UUID,
        kind: "EMAIL",
        provider: "gmail",
        consentGrantId: UUID,
        status: "ERROR",
        cursor: null,
        lastSyncAt: null,
        error: "Disconnected — reconnect to resume sync",
        hasToken: false,
        health: {
          tone: "needs_reconnect",
          label: "Reconnect needed",
          status: "ERROR",
          lastSyncAt: null,
          error: "Disconnected — reconnect to resume sync",
          needsReconnect: true,
          hasToken: false,
        },
      }).health?.needsReconnect,
    ).toBe(true);
  });

  it("accepts a correction body and rejects empty corrections", () => {
    expect(
      CorrectIngestionDocumentBodySchema.parse({ totalMinor: 100 }).totalMinor,
    ).toBe(100);
    expect(() => CorrectIngestionDocumentBodySchema.parse({})).toThrow();
  });

  it("validates activity items and patch source bodies", () => {
    expect(
      IngestionActivityItemSchema.parse({
        id: UUID,
        kind: "EMAIL",
        merchant: "Amazon",
        status: "MATCHED",
        matchedPurchaseId: null,
        subject: "Order",
        snippet: null,
        totalMinor: 100,
        currency: "INR",
        createdAt: ISO,
      }).merchant,
    ).toBe("Amazon");
    expect(
      PatchIngestionSourceBodySchema.parse({
        status: "PAUSED",
        mutedMerchants: ["SWIGGY"],
      }).status,
    ).toBe("PAUSED");
  });
});

describe("purchases schemas", () => {
  it("accepts a valid purchase", () => {
    const p = MerchantPurchaseSchema.parse({
      id: UUID,
      source: "EMAIL",
      merchant: "Amazon",
      orderRef: null,
      purchasedAt: ISO,
      currency: "INR",
      totalMinor: 129900,
      status: "CONFIRMED",
      rawDocId: null,
    });
    expect(p.totalMinor).toBe(129900);
  });

  it("requires at least one item on ingest", () => {
    expect(() =>
      IngestPurchaseBodySchema.parse({
        source: "MANUAL",
        merchant: "Shop",
        currency: "INR",
        totalMinor: 100,
        items: [],
      }),
    ).toThrow();
  });

  it("accepts a well-formed ingest body", () => {
    const b = IngestPurchaseBodySchema.parse({
      source: "RECEIPT",
      merchant: "Shop",
      currency: "USD",
      totalMinor: 1999,
      items: [{ title: "Shirt", priceMinor: 1999, qty: 1 }],
    });
    expect(b.items).toHaveLength(1);
  });

  it("validates merge and split bodies", () => {
    expect(
      MergePurchasesBodySchema.parse({
        targetPurchaseId: UUID,
        sourcePurchaseId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      }).targetPurchaseId,
    ).toBe(UUID);
    expect(() =>
      MergePurchasesBodySchema.parse({
        targetPurchaseId: UUID,
        sourcePurchaseId: UUID,
      }),
    ).toThrow();
    expect(
      SplitPurchaseBodySchema.parse({
        purchaseId: UUID,
        itemIds: [UUID],
      }).itemIds,
    ).toHaveLength(1);
  });
});

describe("receipt schemas", () => {
  it("requires confidence on parsed and list responses", () => {
    expect(() =>
      ReceiptParsedSchema.parse({
        id: UUID,
        userId: UUID,
        imageUrl: "https://cdn.example/r.jpg",
        merchant: "Mart",
        purchasedAt: ISO,
        totalMinor: 100,
        currency: "INR",
        items: [{ title: "X", priceMinor: 100 }],
        ocrJson: {},
        purchaseId: null,
      }),
    ).toThrow();

    expect(
      ReceiptResponseSchema.parse({
        id: UUID,
        merchant: "Mart",
        purchasedAt: ISO,
        totalMinor: 100,
        currency: "INR",
        imageUrl: "https://cdn.example/r.jpg",
        purchaseId: null,
        createdAt: ISO,
        confidence: 0.88,
      }).confidence,
    ).toBe(0.88);
  });

  it("accepts manual correction patch and confirm override flag", () => {
    expect(
      PatchReceiptBodySchema.parse({
        merchant: "Fixed",
        totalMinor: 500,
        purchasedAt: ISO,
        items: [{ title: "Socks", priceMinor: 500 }],
      }).merchant,
    ).toBe("Fixed");

    expect(() => PatchReceiptBodySchema.parse({})).toThrow();

    expect(
      ConfirmReceiptBodySchema.parse({
        merchant: "Mart",
        purchasedAt: ISO,
        totalMinor: 100,
        currency: "INR",
        items: [{ title: "X", priceMinor: 100 }],
        overrideLowConfidence: true,
      }).overrideLowConfidence,
    ).toBe(true);
  });
});

describe("wardrobe schemas", () => {
  it("requires laundryStatus on wardrobe items and defaults create body", () => {
    const item = WardrobeItemSchema.parse({
      id: UUID,
      userId: UUID,
      source: "MANUAL",
      category: "shirt",
      colors: ["blue"],
      brand: null,
      costMinor: 0,
      imageKeys: [],
      garmentImageKey: null,
      purchaseItemId: null,
      laundryStatus: "CLEAN",
      createdAt: ISO,
      updatedAt: ISO,
    });
    expect(item.laundryStatus).toBe("CLEAN");
    expect(item.closetStatus).toBe("ACTIVE");
    expect(item.tags).toEqual([]);

    expect(CreateWardrobeItemBodySchema.parse({ category: "jeans" }).laundryStatus).toBe("CLEAN");
    expect(CreateWardrobeItemBodySchema.parse({ category: "jeans" }).closetStatus).toBe("ACTIVE");
    expect(
      UpdateWardrobeItemBodySchema.parse({ laundryStatus: "DIRTY" }).laundryStatus,
    ).toBe("DIRTY");
    expect(
      UpdateWardrobeItemBodySchema.parse({ closetStatus: "STORED" }).closetStatus,
    ).toBe("STORED");
    expect(() => UpdateWardrobeItemBodySchema.parse({})).toThrow();
  });

  it("accepts optional imageKey on wear body", () => {
    const body = CreateWearBodySchema.parse({
      wardrobeItemId: UUID,
      imageKey: "wear/user/photo.jpg",
    });
    expect(body.imageKey).toBe("wear/user/photo.jpg");
    expect(CreateWearBodySchema.parse({ outfitId: UUID }).imageKey).toBeUndefined();
  });
});

describe("gift wishlist normalize", () => {
  it("normalizes legacy strings and drops invalid entries", () => {
    expect(normalizeWishlist("nope")).toEqual([]);
    expect(normalizeWishlist(["Silk scarf", { title: "Watch" }, 12, { title: "" }])).toEqual([
      { listingId: null, title: "Silk scarf", url: null, note: null },
      { listingId: null, title: "Watch", url: null, note: null },
    ]);
  });
});

describe("cashback click body Closet affiliate", () => {
  it("requires listingId for play_listing but not Closet sources", () => {
    expect(
      CashbackClickBodySchema.safeParse({
        platform: "amazon",
        source: "play_listing",
      }).success,
    ).toBe(false);
    expect(
      CashbackClickBodySchema.parse({
        platform: "myntra",
        source: "vault_use_it_now",
        url: "https://myntra.com/x",
      }).source,
    ).toBe("vault_use_it_now");
    expect(
      CashbackClickBodySchema.parse({
        platform: "amazon",
        source: "use_this_weekend",
        url: "https://www.amazon.in/",
      }).source,
    ).toBe("use_this_weekend");
  });
});
