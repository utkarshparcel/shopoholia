import { describe, expect, it } from "vitest";
import { listAuditRecords, clearAuditLog } from "../lib/audit.js";
import { buildTestServer, login } from "../test-utils.js";

describe("U016–U025 useful returns/packages chores", () => {
  it("U016 stores SIZE_* reason and U022 per-item create", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const purchase = await app.deps.repos.createMerchantPurchase({
      userId,
      source: "EMAIL",
      merchant: "Myntra",
      orderRef: "ORD-U016",
      purchasedAt: new Date(),
      currency: "INR",
      totalMinor: 40000,
      items: [
        { title: "Kurta", priceMinor: 20000, category: "ETHNIC" },
        { title: "Dupatta", priceMinor: 20000, category: "ETHNIC" },
      ],
    });
    const itemA = purchase.items[0]!;
    const itemB = purchase.items[1]!;

    const a = await app.inject({
      method: "POST",
      url: "/returns",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { purchaseItemId: itemA.id, reason: "SIZE_TOO_SMALL", orderedSize: "M" },
    });
    expect(a.statusCode).toBe(201);
    expect(a.json()).toMatchObject({ reason: "SIZE_TOO_SMALL", purchaseItemId: itemA.id });

    const b = await app.inject({
      method: "POST",
      url: `/returns/${itemB.id}/initiate`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { reason: "QUALITY" },
    });
    expect(b.statusCode).toBe(200);
    expect(b.json()).toMatchObject({ reason: "QUALITY", purchaseItemId: itemB.id });
  });

  it("U019 reschedule + cancel pickup; U025 window correct audits", async () => {
    clearAuditLog();
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const purchase = await app.deps.repos.createMerchantPurchase({
      userId,
      source: "MANUAL",
      merchant: "Ajio",
      purchasedAt: new Date(),
      currency: "INR",
      totalMinor: 10000,
      items: [{ title: "Jeans", priceMinor: 10000 }],
    });
    const created = await app.inject({
      method: "POST",
      url: "/returns",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { purchaseId: purchase.purchase.id, reason: "TOO_BIG" },
    });
    const returnId = (created.json() as { id: string }).id;
    await app.inject({
      method: "POST",
      url: `/returns/${returnId}/initiate`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    const slot1 = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const book = await app.inject({
      method: "POST",
      url: `/returns/${returnId}/pickup`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { pickupSlotAt: slot1 },
    });
    expect(book.statusCode).toBe(200);
    expect(book.json()).toMatchObject({ state: "PICKUP_SCHEDULED" });

    const slot2 = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const reschedule = await app.inject({
      method: "POST",
      url: `/returns/${returnId}/pickup/reschedule`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { pickupSlotAt: slot2 },
    });
    expect(reschedule.statusCode).toBe(200);
    expect((reschedule.json() as { pickupSlotAt: string }).pickupSlotAt).toBe(slot2);

    const cancel = await app.inject({
      method: "POST",
      url: `/returns/${returnId}/pickup/cancel`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json()).toMatchObject({ state: "INITIATED", pickupSlotAt: null });

    const nextWindow = new Date(Date.now() + 14 * 86_400_000).toISOString();
    const windowFix = await app.inject({
      method: "POST",
      url: `/returns/${returnId}/window`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { windowDeadline: nextWindow, reason: "Merchant email said 14 days" },
    });
    expect(windowFix.statusCode).toBe(200);
    expect((windowFix.json() as { windowDeadline: string }).windowDeadline).toBe(nextWindow);
    expect(
      listAuditRecords({ userId, event: "return.window.corrected" }).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("U020 chase snooze + escalate", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const purchase = await app.deps.repos.createMerchantPurchase({
      userId,
      source: "EMAIL",
      merchant: "Flipkart",
      purchasedAt: new Date(),
      currency: "INR",
      totalMinor: 5000,
      items: [{ title: "Tee", priceMinor: 5000 }],
    });
    const created = await app.inject({
      method: "POST",
      url: "/returns",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { purchaseId: purchase.purchase.id },
    });
    const returnId = (created.json() as { id: string }).id;
    await app.inject({
      method: "POST",
      url: `/returns/${returnId}/initiate`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });

    const snooze = await app.inject({
      method: "POST",
      url: `/returns/${returnId}/chase/snooze`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { days: 2 },
    });
    expect(snooze.statusCode).toBe(200);
    expect((snooze.json() as { chaseSnoozeUntil: string | null }).chaseSnoozeUntil).toBeTruthy();

    const escalate = await app.inject({
      method: "POST",
      url: `/returns/${returnId}/chase/escalate`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(escalate.statusCode).toBe(200);
    expect(escalate.json()).toMatchObject({ chaseEscalated: true });
  });

  it("U017 enriches orderRef for portal checklist; U018 tracking paste", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const purchase = await app.deps.repos.createMerchantPurchase({
      userId,
      source: "EMAIL",
      merchant: "Myntra",
      orderRef: "PORTAL-42",
      purchasedAt: new Date(),
      currency: "INR",
      totalMinor: 9000,
      deliveryStatus: "IN_TRANSIT",
      items: [{ title: "SKU-BLUE-M", priceMinor: 9000 }],
    });
    const created = await app.inject({
      method: "POST",
      url: "/returns",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        purchaseId: purchase.purchase.id,
        purchaseItemId: purchase.items[0]!.id,
        reason: "TOO_SMALL",
      },
    });
    expect(created.json()).toMatchObject({ orderRef: "PORTAL-42", itemTitle: "SKU-BLUE-M" });

    const patch = await app.inject({
      method: "PATCH",
      url: `/packages/${purchase.purchase.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        trackingCode: "1Z999AA10123456784",
        carrier: "UPS",
        // Forward from IN_TRANSIT; the package state machine rejects IN_TRANSIT -> SHIPPED.
        deliveryStatus: "OUT_FOR_DELIVERY",
      },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json()).toMatchObject({
      trackingCode: "1Z999AA10123456784",
      carrier: "UPS",
    });
  });

  it("U023 address fix reattempt + U024 delivery proof claim packet", async () => {
    const { app } = await buildTestServer();
    const { accessToken, userId } = await login(app);
    const purchase = await app.deps.repos.createMerchantPurchase({
      userId,
      source: "EMAIL",
      merchant: "Amazon",
      orderRef: "RTO-1",
      purchasedAt: new Date(),
      currency: "INR",
      totalMinor: 12000,
      deliveryStatus: "FAILED",
      items: [{ title: "Shoes", priceMinor: 12000 }],
    });

    const fix = await app.inject({
      method: "POST",
      url: `/packages/${purchase.purchase.id}/rto/address-fix`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { deliveryAddressNote: "Flat 2B, Gate 3", reattempt: true },
    });
    expect(fix.statusCode).toBe(200);
    expect(fix.json()).toMatchObject({
      deliveryStatus: "SHIPPED",
      deliveryAddressNote: "Flat 2B, Gate 3",
    });

    // reset to FAILED for proof attach path (still allowed on any status)
    await app.deps.repos.updateMerchantPurchaseDelivery(purchase.purchase.id, userId, {
      deliveryStatus: "FAILED",
    });

    const proof = await app.inject({
      method: "POST",
      url: `/packages/${purchase.purchase.id}/delivery-proof`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { imageKey: "proofs/damage-1.jpg" },
    });
    expect(proof.statusCode).toBe(200);
    const body = proof.json() as {
      deliveryProofKeys: string[];
      claimPacket: { proofKeys: string[]; merchant: string };
    };
    expect(body.deliveryProofKeys).toContain("proofs/damage-1.jpg");
    expect(body.claimPacket.proofKeys).toContain("proofs/damage-1.jpg");
    expect(body.claimPacket.merchant).toBe("Amazon");
  });
});
