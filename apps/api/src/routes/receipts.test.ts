import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildTestServer, login } from "../test-utils.js";

function buildMultipart(fileBuffer: Buffer, filename = "receipt.jpg") {
  const boundary = "----wornreceiptboundary";
  const head =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `Content-Type: image/jpeg\r\n\r\n`;
  const tail = `\r\n--${boundary}--\r\n`;
  const body = Buffer.concat([
    Buffer.from(head, "utf8"),
    fileBuffer,
    Buffer.from(tail, "utf8"),
  ]);
  return {
    payload: body,
    contentType: `multipart/form-data; boundary=${boundary}`,
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

describe("receipts", () => {
  let app: Awaited<ReturnType<typeof buildTestServer>>["app"];
  let repos: Awaited<ReturnType<typeof buildTestServer>>["repos"];
  let token: string;
  let userId: string;

  beforeEach(async () => {
    const server = await buildTestServer();
    app = server.app;
    repos = server.repos;
    const session = await login(app);
    token = session.accessToken;
    userId = session.userId;
  });

  afterEach(async () => {
    await app.close();
  });

  async function grantFinancialConsent() {
    await app.inject({
      method: "POST",
      url: "/vault/consent",
      headers: { authorization: `Bearer ${token}` },
      payload: { userId, scope: "FINANCIAL", source: "onboarding" },
    });
  }

  it("requires FINANCIAL consent to upload a receipt (403)", async () => {
    const m = buildMultipart(Buffer.from("fake-image-bytes"));
    const res = await app.inject({
      method: "POST",
      url: "/receipts",
      headers: { authorization: `Bearer ${token}`, "content-type": m.contentType },
      payload: m.payload,
    });
    expect(res.statusCode).toBe(403);
  });

  it("uploads a receipt, OCRs it, and returns parsed fields", async () => {
    await grantFinancialConsent();
    const m = buildMultipart(Buffer.from("fake-image-bytes"));
    const res = await app.inject({
      method: "POST",
      url: "/receipts",
      headers: { authorization: `Bearer ${token}`, "content-type": m.contentType },
      payload: m.payload,
    });
    expect(res.statusCode).toBe(201);
    const parsed = res.json();
    expect(parsed.merchant).toBe("Mock Mart");
    expect(parsed.totalMinor).toBe(129900);
    expect(parsed.items).toHaveLength(2);
    expect(parsed.confidence).toBe(0.92);
    expect(parsed.purchaseId).toBeNull();

    const list = await app.inject({
      method: "GET",
      url: "/receipts",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.statusCode).toBe(200);
    const listed = list.json();
    expect(listed.receipts).toHaveLength(1);
    // Clients must receive a signed URL, never the raw R2 key.
    expect(listed.receipts[0].imageKey).toBeUndefined();
    expect(typeof listed.receipts[0].imageUrl).toBe("string");
    expect(listed.receipts[0].imageUrl).not.toMatch(/^receipts\//);
    expect(listed.receipts[0].confidence).toBe(0.92);
  });

  it("PATCH manually corrects merchant, total, purchasedAt, and line items", async () => {
    await grantFinancialConsent();
    const upload = await app.inject({
      method: "POST",
      url: "/receipts",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": buildMultipart(Buffer.from("bytes")).contentType,
      },
      payload: buildMultipart(Buffer.from("bytes")).payload,
    });
    expect(upload.statusCode).toBe(201);
    const receiptId = upload.json().id;
    const purchasedAt = "2024-06-15T10:00:00.000Z";

    const patch = await app.inject({
      method: "PATCH",
      url: `/receipts/${receiptId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        merchant: "Corrected Mart",
        totalMinor: 99900,
        purchasedAt,
        items: [
          { title: "Fixed Shirt", priceMinor: 49900, category: "top" },
          { title: "Fixed Pants", priceMinor: 50000, category: "bottom" },
        ],
      },
    });
    expect(patch.statusCode).toBe(200);
    const corrected = patch.json();
    expect(corrected.merchant).toBe("Corrected Mart");
    expect(corrected.totalMinor).toBe(99900);
    expect(corrected.purchasedAt).toBe(purchasedAt);
    expect(corrected.items).toEqual([
      { title: "Fixed Shirt", priceMinor: 49900, category: "top" },
      { title: "Fixed Pants", priceMinor: 50000, category: "bottom" },
    ]);
    expect(corrected.confidence).toBe(0.92);

    const confirm = await app.inject({
      method: "POST",
      url: `/receipts/${receiptId}/confirm`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        merchant: corrected.merchant,
        purchasedAt: corrected.purchasedAt,
        totalMinor: corrected.totalMinor,
        currency: "INR",
        items: corrected.items,
      },
    });
    expect(confirm.statusCode).toBe(200);
    expect(confirm.json().confidence).toBe(0.92);
    expect(confirm.json().merchant).toBe("Corrected Mart");
    expect(confirm.json().totalMinor).toBe(99900);

    const purchases = await repos.listMerchantPurchases(userId);
    expect(purchases[0]!.merchant).toBe("Corrected Mart");
    expect(purchases[0]!.totalMinor).toBe(99900);
  });

  it("confirm body accepts manual corrections and returns confidence", async () => {
    await grantFinancialConsent();
    const upload = await app.inject({
      method: "POST",
      url: "/receipts",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": buildMultipart(Buffer.from("bytes")).contentType,
      },
      payload: buildMultipart(Buffer.from("bytes")).payload,
    });
    const receiptId = upload.json().id;
    const purchasedAt = "2024-01-02T12:00:00.000Z";

    const confirm = await app.inject({
      method: "POST",
      url: `/receipts/${receiptId}/confirm`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        merchant: "Manual Merchant",
        purchasedAt,
        totalMinor: 1500,
        currency: "INR",
        items: [{ title: "Socks", priceMinor: 1500 }],
        overrideLowConfidence: true,
      },
    });
    expect(confirm.statusCode).toBe(200);
    const body = confirm.json();
    expect(body.confidence).toBe(0.92);
    expect(body.merchant).toBe("Manual Merchant");
    expect(body.totalMinor).toBe(1500);
    expect(body.purchasedAt).toBe(purchasedAt);
  });

  it("confirms a receipt and writes prices into merchant_purchases", async () => {
    await grantFinancialConsent();

    const upload = await app.inject({
      method: "POST",
      url: "/receipts",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": buildMultipart(Buffer.from("bytes")).contentType,
      },
      payload: buildMultipart(Buffer.from("bytes")).payload,
    });
    const receiptId = upload.json().id;

    const confirm = await app.inject({
      method: "POST",
      url: `/receipts/${receiptId}/confirm`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        merchant: "Mock Mart",
        purchasedAt: new Date().toISOString(),
        totalMinor: 129900,
        currency: "INR",
        items: [
          { title: "Cotton T-Shirt", priceMinor: 49900 },
          { title: "Denim Jeans", priceMinor: 80000 },
        ],
        warranties: [
          {
            itemIndex: 1,
            coverageUntil: new Date(Date.now() + 90 * 86_400_000).toISOString(),
            claimContact: "support@mockmart.com",
          },
        ],
      },
    });
    expect(confirm.statusCode).toBe(200);
    const confirmation = confirm.json();
    expect(confirmation.purchaseId).not.toBeNull();
    // Confirm response also returns a signed URL, not the raw key.
    expect(confirmation.imageKey).toBeUndefined();
    expect(typeof confirmation.imageUrl).toBe("string");
    expect(confirmation.imageUrl).not.toMatch(/^receipts\//);

    // Prices must land in merchant_purchases (unlocks Waste Tracker + Accountant).
    const purchases = await repos.listMerchantPurchases(userId);
    expect(purchases).toHaveLength(1);
    expect(purchases[0]!.totalMinor).toBe(129900);
    expect(purchases[0]!.source).toBe("RECEIPT");

    const items = await repos.listMerchantPurchaseItems(purchases[0]!.id);
    expect(items).toHaveLength(2);
    expect(items.reduce((s, i) => s + i.priceMinor, 0)).toBe(129900);

    // Warranty created from the confirm payload.
    const warranties = await app.inject({
      method: "GET",
      url: "/warranties",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(warranties.statusCode).toBe(200);
    const ws = warranties.json().warranties;
    expect(ws).toHaveLength(1);
    expect(ws[0].itemTitle).toBe("Denim Jeans");
    expect(ws[0].state).toBe("ACTIVE");

    // Claim the warranty — one-tap rail returns mailto with merchant + item refs.
    const claim = await app.inject({
      method: "POST",
      url: `/warranties/${ws[0].id}/claim`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(claim.statusCode).toBe(200);
    const claimed = claim.json();
    expect(claimed.state).toBe("CLAIMED");
    expect(claimed.claimUrl).toMatch(/^mailto:support@mockmart\.com\?/);
    expect(claimed.packet?.emailBody).toContain("Denim Jeans");
    expect(claimed.packet?.attachmentKeys?.length).toBeGreaterThanOrEqual(1);
    expect(claimed.canUnclaim).toBe(true);
    const decoded = decodeURIComponent(claimed.claimUrl as string);
    expect(decoded).toContain("Denim Jeans");
    expect(decoded).toContain("Mock Mart");
    expect(claimed.orderRef).toBeNull();

    const listed = await app.inject({
      method: "GET",
      url: "/warranties",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(listed.json().warranties[0].state).toBe("CLAIMED");
  });

  it("audits warranty.claimed and returns https claim portal + orderRef", async () => {
    await grantFinancialConsent();
    const info = vi.spyOn(app.log, "info").mockImplementation(() => undefined);

    const upload = await app.inject({
      method: "POST",
      url: "/receipts",
      headers: {
        authorization: `Bearer ${token}`,
        ...buildMultipart(Buffer.from("bytes")).headers,
      },
      payload: buildMultipart(Buffer.from("bytes")).payload,
    });
    const receiptId = upload.json().id as string;

    await app.inject({
      method: "POST",
      url: `/receipts/${receiptId}/confirm`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        merchant: "Croma",
        purchasedAt: new Date().toISOString(),
        totalMinor: 49900,
        currency: "INR",
        items: [{ title: "Wireless Headphones", priceMinor: 49900 }],
        warranties: [
          {
            itemIndex: 0,
            coverageUntil: new Date(Date.now() + 365 * 86_400_000).toISOString(),
            claimContact: "https://croma.com/warranty/claim",
          },
        ],
      },
    });

    const purchases = await repos.listMerchantPurchases(userId);
    expect(purchases).toHaveLength(1);
    purchases[0]!.orderRef = "ORD-CROMA-42";

    const warranties = await app.inject({
      method: "GET",
      url: "/warranties",
      headers: { authorization: `Bearer ${token}` },
    });
    const wid = warranties.json().warranties[0].id as string;

    const claim = await app.inject({
      method: "POST",
      url: `/warranties/${wid}/claim`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(claim.statusCode).toBe(200);
    expect(claim.json().claimUrl).toBe("https://croma.com/warranty/claim");
    expect(claim.json().orderRef).toBe("ORD-CROMA-42");
    expect(claim.json().state).toBe("CLAIMED");

    const audited = info.mock.calls.some((args) => {
      const payload = args[0] as { audit?: boolean; event?: string };
      return payload?.audit === true && payload?.event === "warranty.claimed";
    });
    expect(audited).toBe(true);
    info.mockRestore();

    const unclaim = await app.inject({
      method: "POST",
      url: `/warranties/${wid}/unclaim`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(unclaim.statusCode).toBe(200);
    expect(unclaim.json().state).toBe("ACTIVE");
  });

  it("snoozes a warranty reminder into the future", async () => {
    await grantFinancialConsent();
    const upload = await app.inject({
      method: "POST",
      url: "/receipts",
      headers: {
        authorization: `Bearer ${token}`,
        ...buildMultipart(Buffer.from("bytes")).headers,
      },
      payload: buildMultipart(Buffer.from("bytes")).payload,
    });
    const receiptId = upload.json().id as string;
    await app.inject({
      method: "POST",
      url: `/receipts/${receiptId}/confirm`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        merchant: "Croma",
        purchasedAt: new Date().toISOString(),
        totalMinor: 49900,
        currency: "INR",
        items: [
          {
            title: "Wireless Headphones",
            priceMinor: 49900,
            category: "electronics",
          },
        ],
        warranties: [
          {
            itemIndex: 0,
            coverageUntil: new Date(Date.now() + 90 * 86_400_000).toISOString(),
            claimContact: "support@croma.com",
            category: "electronics",
          },
        ],
      },
    });
    const list = await app.inject({
      method: "GET",
      url: "/warranties",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(list.json().warranties[0].category).toBe("electronics");
    const warrantyId = list.json().warranties[0].id as string;

    const until = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const snooze = await app.inject({
      method: "POST",
      url: `/warranties/${warrantyId}/snooze`,
      headers: { authorization: `Bearer ${token}` },
      payload: { until },
    });
    expect(snooze.statusCode).toBe(200);
    expect(snooze.json().warrantyId).toBe(warrantyId);
    expect(new Date(snooze.json().snoozedUntil).getTime()).toBeGreaterThan(
      Date.now() - 1000,
    );
    expect(["published", "skipped"]).toContain(snooze.json().status);
  });

  it("returns 404 confirming a non-existent receipt", async () => {
    await grantFinancialConsent();
    const res = await app.inject({
      method: "POST",
      url: `/receipts/00000000-0000-4000-8000-0000000000aa/confirm`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        merchant: "X",
        purchasedAt: new Date().toISOString(),
        totalMinor: 100,
        currency: "INR",
        items: [{ title: "Y", priceMinor: 100 }],
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it("confirm is once per receipt: a double tap and a repeat make one purchase and one warranty set", async () => {
    await grantFinancialConsent();
    const receipt = await repos.createReceipt({
      userId,
      imageKey: "receipts/twice.jpg",
      merchant: "Mock Mart",
      purchasedAt: new Date("2024-01-01T00:00:00.000Z"),
      totalMinor: 5000,
      ocrJson: { items: [{ title: "Wireless Headphones", priceMinor: 5000 }] },
      purchaseId: null,
    });
    const confirm = () =>
      app.inject({
        method: "POST",
        url: `/receipts/${receipt.id}/confirm`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          merchant: "Mock Mart",
          purchasedAt: "2024-01-01T00:00:00.000Z",
          totalMinor: 5000,
          currency: "INR",
          items: [{ title: "Wireless Headphones", priceMinor: 5000 }],
        },
      });
    const [a, b] = await Promise.all([confirm(), confirm()]);
    const c = await confirm();
    expect([a.statusCode, b.statusCode, c.statusCode]).toEqual([200, 200, 200]);
    const purchaseId = a.json().purchaseId;
    expect(purchaseId).toBeTruthy();
    expect(b.json().purchaseId).toBe(purchaseId);
    expect(c.json().purchaseId).toBe(purchaseId);
    const purchases = (await repos.listMerchantPurchases(userId)).filter((p) => p.source === "RECEIPT");
    expect(purchases).toHaveLength(1);
    expect(await repos.listWarranties(userId)).toHaveLength(1);

    const other = await login(app, "919876500003");
    await app.inject({
      method: "POST",
      url: "/vault/consent",
      headers: { authorization: `Bearer ${other.accessToken}` },
      payload: { userId: other.userId, scope: "FINANCIAL", source: "onboarding" },
    });
    const foreign = await app.inject({
      method: "POST",
      url: `/receipts/${receipt.id}/confirm`,
      headers: { authorization: `Bearer ${other.accessToken}` },
      payload: {
        merchant: "Mock Mart",
        purchasedAt: "2024-01-01T00:00:00.000Z",
        totalMinor: 5000,
        currency: "INR",
        items: [{ title: "Wireless Headphones", priceMinor: 5000 }],
      },
    });
    expect(foreign.statusCode).toBe(404);
  });

  it("auto-detects warranty from category rules when confirm omits warranties (U010)", async () => {
    await grantFinancialConsent();
    const receipt = await repos.createReceipt({
      userId,
      imageKey: "receipts/rules.jpg",
      merchant: "Mock Mart",
      purchasedAt: new Date("2024-01-01T00:00:00.000Z"),
      totalMinor: 5000,
      ocrJson: {
        items: [{ title: "Wireless Headphones", priceMinor: 5000 }],
      },
      purchaseId: null,
    });

    const confirm = await app.inject({
      method: "POST",
      url: `/receipts/${receipt.id}/confirm`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        merchant: "Mock Mart",
        purchasedAt: "2024-01-01T00:00:00.000Z",
        totalMinor: 5000,
        currency: "INR",
        items: [{ title: "Wireless Headphones", priceMinor: 5000 }],
      },
    });
    expect(confirm.statusCode).toBe(200);

    const warranties = await app.inject({
      method: "GET",
      url: "/warranties",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(warranties.statusCode).toBe(200);
    const ws = warranties.json().warranties;
    expect(ws).toHaveLength(1);
    expect(ws[0].itemTitle).toBe("Wireless Headphones");
    expect(ws[0].category).toBe("electronics");
  });

  it("auto-detects warranty from OCR hint when confirm has no warranties", async () => {
    await grantFinancialConsent();
    const receipt = await repos.createReceipt({
      userId,
      imageKey: "receipts/hint.jpg",
      merchant: "Mock Mart",
      purchasedAt: new Date("2024-01-01T00:00:00.000Z"),
      totalMinor: 5000,
      ocrJson: {
        warrantyHint: { itemIndex: 0, months: 12 },
        items: [{ title: "Blender", priceMinor: 5000 }],
      },
      purchaseId: null,
    });

    const confirm = await app.inject({
      method: "POST",
      url: `/receipts/${receipt.id}/confirm`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        merchant: "Mock Mart",
        purchasedAt: "2024-01-01T00:00:00.000Z",
        totalMinor: 5000,
        currency: "INR",
        items: [{ title: "Blender", priceMinor: 5000 }],
      },
    });
    expect(confirm.statusCode).toBe(200);

    const warranties = await app.inject({
      method: "GET",
      url: "/warranties",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(warranties.statusCode).toBe(200);
    const ws = warranties.json().warranties;
    expect(ws).toHaveLength(1);
    expect(ws[0].itemTitle).toBe("Blender");
    expect(ws[0].provider).toBe("Mock Mart");
  });

  it("skips category-rule auto when client sends empty warranties array (U010 opt-out)", async () => {
    await grantFinancialConsent();
    const receipt = await repos.createReceipt({
      userId,
      imageKey: "receipts/optout.jpg",
      merchant: "Mock Mart",
      purchasedAt: new Date("2024-01-01T00:00:00.000Z"),
      totalMinor: 5000,
      ocrJson: {
        items: [{ title: "Wireless Headphones", priceMinor: 5000 }],
      },
      purchaseId: null,
    });

    const confirm = await app.inject({
      method: "POST",
      url: `/receipts/${receipt.id}/confirm`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        merchant: "Mock Mart",
        purchasedAt: "2024-01-01T00:00:00.000Z",
        totalMinor: 5000,
        currency: "INR",
        items: [{ title: "Wireless Headphones", priceMinor: 5000 }],
        warranties: [],
      },
    });
    expect(confirm.statusCode).toBe(200);

    const warranties = await app.inject({
      method: "GET",
      url: "/warranties",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(warranties.json().warranties).toHaveLength(0);
  });

  it("GET /receipts filters by merchant, date, and GSTIN", async () => {
    await grantFinancialConsent();
    const a = await repos.createReceipt({
      userId,
      imageKey: "receipts/a.jpg",
      merchant: "Myntra",
      purchasedAt: new Date("2026-01-15T10:00:00.000Z"),
      totalMinor: 1000,
      ocrJson: { gstin: "29AABCU9603R1ZM", confidence: 0.9 },
      purchaseId: null,
    });
    await repos.createReceipt({
      userId,
      imageKey: "receipts/b.jpg",
      merchant: "Amazon",
      purchasedAt: new Date("2026-03-01T10:00:00.000Z"),
      totalMinor: 2000,
      ocrJson: { gstin: "27AAPFU0939F1ZV", confidence: 0.9 },
      purchaseId: null,
    });

    const byMerchant = await app.inject({
      method: "GET",
      url: "/receipts?merchant=myn",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(byMerchant.statusCode).toBe(200);
    expect(byMerchant.json().receipts.map((r: { id: string }) => r.id)).toEqual([a.id]);

    const byGstin = await app.inject({
      method: "GET",
      url: "/receipts?gstin=29AABCU9603R1ZM",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(byGstin.statusCode).toBe(200);
    expect(byGstin.json().receipts).toHaveLength(1);
    expect(byGstin.json().receipts[0].gstin).toBe("29AABCU9603R1ZM");

    const byDate = await app.inject({
      method: "GET",
      url: "/receipts?from=2026-02-01&to=2026-03-31",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(byDate.statusCode).toBe(200);
    expect(byDate.json().receipts).toHaveLength(1);
    expect(byDate.json().receipts[0].merchant).toBe("Amazon");
  });

  it("GET /receipts/:id/export returns image and pdf downloads", async () => {
    await grantFinancialConsent();
    const receipt = await repos.createReceipt({
      userId,
      imageKey: "receipts/export.jpg",
      merchant: "Mock Mart",
      purchasedAt: new Date("2026-08-01T10:00:00.000Z"),
      totalMinor: 129900,
      ocrJson: { gstin: "29AABCU9603R1ZM", confidence: 0.92 },
      purchaseId: null,
    });

    const image = await app.inject({
      method: "GET",
      url: `/receipts/${receipt.id}/export?format=image`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(image.statusCode).toBe(200);
    const imageBody = image.json();
    expect(imageBody.format).toBe("image");
    expect(imageBody.contentType).toBe("image/jpeg");
    expect(typeof imageBody.downloadUrl).toBe("string");
    expect(imageBody.gstin).toBe("29AABCU9603R1ZM");

    const pdf = await app.inject({
      method: "GET",
      url: `/receipts/${receipt.id}/export?format=pdf`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(pdf.statusCode).toBe(200);
    const pdfBody = pdf.json();
    expect(pdfBody.format).toBe("pdf");
    expect(pdfBody.contentType).toBe("application/pdf");
    expect(pdfBody.downloadUrl.startsWith("data:application/pdf;base64,")).toBe(true);
  });
});
