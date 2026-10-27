import { describe, expect, it } from "vitest";
import type {
  ClosetProfile,
  ClosetProfileListResponse,
  ClosetProfileOutfitsResponse,
  ClosetProfileWardrobeResponse,
  Household,
  HouseholdDetailResponse,
  HouseholdInviteResponse,
  HouseholdWardrobeResponse,
  LendActionResponse,
  LentListResponse,
  WardrobeItem,
  WardrobeListResponse,
} from "@worn/shared";
import { buildTestServer, login } from "../test-utils.js";

describe("N25 borrow / lent tracker", () => {
  it("lends with due date; due query returns overdue; return clears", async () => {
    const { app } = await buildTestServer();
    const user = await login(app, "919810000025");

    const created = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { category: "kurta", costMinor: 2000, imageKeys: ["k.jpg"] },
    });
    expect(created.statusCode).toBe(201);
    const itemId = (created.json() as WardrobeItem).id;

    const lend = await app.inject({
      method: "POST",
      url: `/wardrobe/${itemId}/lend`,
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { lentTo: "Riya", dueOn: "2026-08-20" },
    });
    expect(lend.statusCode).toBe(200);
    const lentBody = lend.json() as LendActionResponse;
    expect(lentBody.item.lentTo).toBe("Riya");
    expect(lentBody.item.lentDueOn).toBe("2026-08-20");

    const overdue = await app.inject({
      method: "GET",
      url: "/wardrobe/lent?due=overdue&asOf=2026-08-26",
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    expect(overdue.statusCode).toBe(200);
    const list = overdue.json() as LentListResponse;
    expect(list.filter).toBe("overdue");
    expect(list.items).toHaveLength(1);
    expect(list.items[0]?.id).toBe(itemId);

    const returned = await app.inject({
      method: "POST",
      url: `/wardrobe/${itemId}/lend/return`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    expect(returned.statusCode).toBe(200);
    expect((returned.json() as LendActionResponse).item.lentTo).toBeNull();

    const after = await app.inject({
      method: "GET",
      url: "/wardrobe/lent?due=all&asOf=2026-08-26",
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    expect((after.json() as LentListResponse).items).toHaveLength(0);
  });
});

describe("N26 household shared closet", () => {
  it("invite partner; shared wardrobe ACL; deny outsider", async () => {
    const { app } = await buildTestServer();
    const owner = await login(app, "919810000026");
    const partner = await login(app, "919810000027");
    const outsider = await login(app, "919810000028");

    const created = await app.inject({
      method: "POST",
      url: "/households",
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { name: "Home" },
    });
    expect(created.statusCode).toBe(201);
    const household = created.json() as Household;
    expect(household.inviteCode).toMatch(/^[A-Z0-9]{8}$/);

    const invite = await app.inject({
      method: "GET",
      url: `/households/${household.id}/invite`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(invite.statusCode).toBe(200);
    const inviteBody = invite.json() as HouseholdInviteResponse;
    expect(inviteBody.inviteUrl).toBe(`https://worn.app/h/${household.inviteCode}`);

    const denied = await app.inject({
      method: "GET",
      url: `/households/${household.id}/wardrobe`,
      headers: { authorization: `Bearer ${outsider.accessToken}` },
    });
    expect(denied.statusCode).toBe(403);
    expect((denied.json() as { message: string }).message).toMatch(/Not a member/i);

    const joined = await app.inject({
      method: "POST",
      url: "/households/join",
      headers: { authorization: `Bearer ${partner.accessToken}` },
      payload: { inviteCode: household.inviteCode.toLowerCase() },
    });
    expect(joined.statusCode).toBe(200);
    expect((joined.json() as HouseholdDetailResponse).members.length).toBe(2);

    const itemRes = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { category: "shirt", costMinor: 1500, laundryStatus: "DIRTY" },
    });
    const itemId = (itemRes.json() as WardrobeItem).id;

    const shared = await app.inject({
      method: "GET",
      url: `/households/${household.id}/wardrobe`,
      headers: { authorization: `Bearer ${partner.accessToken}` },
    });
    expect(shared.statusCode).toBe(200);
    const wardrobe = shared.json() as HouseholdWardrobeResponse;
    expect(wardrobe.items.some((i) => i.id === itemId)).toBe(true);

    const patch = await app.inject({
      method: "PATCH",
      url: `/households/${household.id}/wardrobe/${itemId}`,
      headers: { authorization: `Bearer ${partner.accessToken}` },
      payload: { laundryStatus: "CLEAN" },
    });
    expect(patch.statusCode).toBe(200);
    expect((patch.json() as WardrobeItem).laundryStatus).toBe("CLEAN");

    const outsiderPatch = await app.inject({
      method: "PATCH",
      url: `/households/${household.id}/wardrobe/${itemId}`,
      headers: { authorization: `Bearer ${outsider.accessToken}` },
      payload: { laundryStatus: "DIRTY" },
    });
    expect(outsiderPatch.statusCode).toBe(403);
  });
});

describe("U015 household vault spend cap", () => {
  it("shares redacted vault; view-only default; cap blocks spend", async () => {
    const { app } = await buildTestServer();
    const owner = await login(app, "919810000115");
    const partner = await login(app, "919810000116");

    for (const u of [owner, partner]) {
      await app.inject({
        method: "POST",
        url: "/vault/consent",
        headers: { authorization: `Bearer ${u.accessToken}` },
        payload: { userId: u.userId, scope: "FINANCIAL", source: "onboarding" },
      });
    }

    const created = await app.inject({
      method: "POST",
      url: "/households",
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { name: "Vault home" },
    });
    const household = created.json() as Household;

    await app.inject({
      method: "POST",
      url: "/households/join",
      headers: { authorization: `Bearer ${partner.accessToken}` },
      payload: { inviteCode: household.inviteCode },
    });

    const credit = await app.inject({
      method: "POST",
      url: "/credits",
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: {
        kind: "GIFT_CARD",
        merchant: "Myntra",
        currency: "INR",
        balanceMinor: 50000,
      },
    });
    expect(credit.statusCode).toBe(201);
    const accountId = (credit.json() as { id: string }).id;

    const vault = await app.inject({
      method: "GET",
      url: `/households/${household.id}/vault`,
      headers: { authorization: `Bearer ${partner.accessToken}` },
    });
    expect(vault.statusCode).toBe(200);
    const body = vault.json() as {
      myAccess: string;
      accounts: Array<Record<string, unknown>>;
    };
    expect(body.myAccess).toBe("VIEW");
    expect(body.accounts.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(body.accounts)).not.toMatch(/last4|cardNumber|capture/i);

    const blocked = await app.inject({
      method: "POST",
      url: `/households/${household.id}/vault/spend`,
      headers: { authorization: `Bearer ${partner.accessToken}` },
      payload: {
        accountId,
        amountMinor: 1000,
        idempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      },
    });
    expect(blocked.statusCode).toBe(403);
    expect((blocked.json() as { message: string }).message).toMatch(/view-only/i);

    await app.inject({
      method: "PATCH",
      url: `/households/${household.id}/vault/members`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: {
        userId: partner.userId,
        vaultAccess: "SPEND",
        spendCapMinor: 1500,
      },
    });

    const ok = await app.inject({
      method: "POST",
      url: `/households/${household.id}/vault/spend`,
      headers: { authorization: `Bearer ${partner.accessToken}` },
      payload: {
        accountId,
        amountMinor: 1000,
        idempotencyKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      },
    });
    expect(ok.statusCode).toBe(200);

    const over = await app.inject({
      method: "POST",
      url: `/households/${household.id}/vault/spend`,
      headers: { authorization: `Bearer ${partner.accessToken}` },
      payload: {
        accountId,
        amountMinor: 1000,
        idempotencyKey: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      },
    });
    expect(over.statusCode).toBe(403);
    expect((over.json() as { message: string }).message).toMatch(/cap/i);
  });
});

describe("N27 kids / multi-profile closets", () => {
  it("switch profile scopes wardrobe and outfits", async () => {
    const { app, repos } = await buildTestServer();
    const user = await login(app, "919810000029");

    const list = await app.inject({
      method: "GET",
      url: "/closet-profiles",
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    expect(list.statusCode).toBe(200);
    const profiles = list.json() as ClosetProfileListResponse;
    expect(profiles.profiles.some((p) => p.kind === "SELF")).toBe(true);
    const selfId = profiles.profiles.find((p) => p.kind === "SELF")!.id;

    const kid = await app.inject({
      method: "POST",
      url: "/closet-profiles",
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { name: "Aarav", kind: "KID" },
    });
    expect(kid.statusCode).toBe(201);
    const kidProfile = kid.json() as ClosetProfile;

    const mine = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { category: "blazer", profileId: selfId, imageKeys: ["b.jpg"] },
    });
    const mineId = (mine.json() as WardrobeItem).id;

    const kids = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { category: "tee", profileId: kidProfile.id, imageKeys: ["t.jpg"] },
    });
    const kidItemId = (kids.json() as WardrobeItem).id;

    const scopedKid = await app.inject({
      method: "GET",
      url: `/closet-profiles/${kidProfile.id}/wardrobe`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    expect(scopedKid.statusCode).toBe(200);
    const kidWardrobe = scopedKid.json() as ClosetProfileWardrobeResponse;
    expect(kidWardrobe.items.map((i) => i.id)).toEqual([kidItemId]);

    const qScoped = await app.inject({
      method: "GET",
      url: `/wardrobe?profileId=${kidProfile.id}`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    expect((qScoped.json() as WardrobeListResponse).items.map((i) => i.id)).toEqual([kidItemId]);

    await repos.createOutfit({
      userId: user.userId,
      itemIds: [mineId],
      occasion: "WORK",
    });
    await repos.createOutfit({
      userId: user.userId,
      itemIds: [kidItemId],
      occasion: "CASUAL",
    });

    const kidOutfits = await app.inject({
      method: "GET",
      url: `/closet-profiles/${kidProfile.id}/outfits`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    expect(kidOutfits.statusCode).toBe(200);
    const oBody = kidOutfits.json() as ClosetProfileOutfitsResponse;
    expect(oBody.outfits).toHaveLength(1);
    expect(oBody.outfits[0]?.itemIds).toEqual([kidItemId]);

    const selfOutfits = await app.inject({
      method: "GET",
      url: `/closet-profiles/${selfId}/outfits`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    expect((selfOutfits.json() as ClosetProfileOutfitsResponse).outfits).toHaveLength(1);
    expect((selfOutfits.json() as ClosetProfileOutfitsResponse).outfits[0]?.itemIds).toEqual([
      mineId,
    ]);
  });
});
