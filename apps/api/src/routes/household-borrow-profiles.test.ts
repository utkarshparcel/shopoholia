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
      payload: { category: "kurta", costMinor: 2000, imageKeys: [`u/${user.userId}/wardrobe/k.jpg`] },
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

    // A retry with the first key returns the first result and charges nothing more.
    const retry = await app.inject({
      method: "POST",
      url: `/households/${household.id}/vault/spend`,
      headers: { authorization: `Bearer ${partner.accessToken}` },
      payload: {
        accountId,
        amountMinor: 1000,
        idempotencyKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      },
    });
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toEqual(ok.json());
    // The same key for a different amount is a conflict.
    const reused = await app.inject({
      method: "POST",
      url: `/households/${household.id}/vault/spend`,
      headers: { authorization: `Bearer ${partner.accessToken}` },
      payload: {
        accountId,
        amountMinor: 200,
        idempotencyKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      },
    });
    expect(reused.statusCode).toBe(409);

    // Outsiders see no household at all.
    const outsider = await login(app, "919810000117");
    for (const req of [
      { method: "GET" as const, url: `/households/${household.id}/vault` },
      {
        method: "POST" as const,
        url: `/households/${household.id}/vault/spend`,
        payload: { accountId, amountMinor: 1, idempotencyKey: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" },
      },
      {
        method: "PATCH" as const,
        url: `/households/${household.id}/vault/members`,
        payload: { userId: outsider.userId, vaultAccess: "SPEND", spendCapMinor: 1 },
      },
    ]) {
      const res = await app.inject({ ...req, headers: { authorization: `Bearer ${outsider.accessToken}` } });
      expect(res.statusCode).toBe(404);
    }
  });

  it("concurrent spends never pass the cap, and a failed charge gives the cap back", async () => {
    const { app, repos } = await buildTestServer();
    const owner = await login(app, "919810000125");
    const partner = await login(app, "919810000126");
    for (const u of [owner, partner]) {
      await app.inject({
        method: "POST",
        url: "/vault/consent",
        headers: { authorization: `Bearer ${u.accessToken}` },
        payload: { scope: "FINANCIAL", source: "onboarding" },
      });
    }
    const household = (
      await app.inject({
        method: "POST",
        url: "/households",
        headers: { authorization: `Bearer ${owner.accessToken}` },
        payload: { name: "Cap home" },
      })
    ).json() as Household;
    await app.inject({
      method: "POST",
      url: "/households/join",
      headers: { authorization: `Bearer ${partner.accessToken}` },
      payload: { inviteCode: household.inviteCode },
    });
    const accountId = (
      await app.inject({
        method: "POST",
        url: "/credits",
        headers: { authorization: `Bearer ${owner.accessToken}` },
        payload: { kind: "GIFT_CARD", merchant: "Myntra", currency: "INR", balanceMinor: 50000 },
      })
    ).json().id as string;
    await app.inject({
      method: "PATCH",
      url: `/households/${household.id}/vault/members`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { userId: partner.userId, vaultAccess: "SPEND", spendCapMinor: 3000 },
    });

    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        app.inject({
          method: "POST",
          url: `/households/${household.id}/vault/spend`,
          headers: { authorization: `Bearer ${partner.accessToken}` },
          payload: { accountId, amountMinor: 1000, idempotencyKey: `eeeeeeee-eeee-4eee-8eee-${String(i).padStart(12, "0")}` },
        }),
      ),
    );
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(3);
    expect(results.filter((r) => r.statusCode === 403)).toHaveLength(3);
    expect((await repos.getHouseholdVaultSettings(household.id, partner.userId)).spentMinor).toBe(3000);

    // More than the credit holds: 409, and the cap is given back.
    await app.inject({
      method: "PATCH",
      url: `/households/${household.id}/vault/members`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { userId: partner.userId, vaultAccess: "SPEND", spendCapMinor: null },
    });
    const tooMuch = await app.inject({
      method: "POST",
      url: `/households/${household.id}/vault/spend`,
      headers: { authorization: `Bearer ${partner.accessToken}` },
      payload: { accountId, amountMinor: 900000, idempotencyKey: "ffffffff-ffff-4fff-8fff-ffffffffffff" },
    });
    expect(tooMuch.statusCode).toBe(409);
    expect((await repos.getHouseholdVaultSettings(household.id, partner.userId)).spentMinor).toBe(3000);

    // A ledger post aborted for a concurrent write (40001) is tried again, and charges once.
    const post = repos.postMoneyLedger.bind(repos);
    let aborts = 1;
    repos.postMoneyLedger = async (input) => {
      if (aborts-- > 0) throw Object.assign(new Error("could not serialize access"), { code: "40001" });
      return post(input);
    };
    const retried = await app.inject({
      method: "POST",
      url: `/households/${household.id}/vault/spend`,
      headers: { authorization: `Bearer ${partner.accessToken}` },
      payload: { accountId, amountMinor: 500, idempotencyKey: "abababab-abab-4bab-8bab-abababababab" },
    });
    expect(retried.statusCode).toBe(200);
    expect(retried.json()).toMatchObject({ balanceMinor: 46500, spentMinor: 3500 });

    // Still aborted after the bounded tries: an error, and the cap is given back.
    aborts = 3;
    const gaveUp = await app.inject({
      method: "POST",
      url: `/households/${household.id}/vault/spend`,
      headers: { authorization: `Bearer ${partner.accessToken}` },
      payload: { accountId, amountMinor: 500, idempotencyKey: "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd" },
    });
    expect(gaveUp.statusCode).toBe(500);
    expect(aborts).toBe(0);
    expect((await repos.getHouseholdVaultSettings(household.id, partner.userId)).spentMinor).toBe(3500);
  });

  it("spend: a retry counts once, concurrent spends stay under the cap, a short balance is 409", async () => {
    const { app } = await buildTestServer();
    const owner = await login(app, "919810000117");
    const partner = await login(app, "919810000118");
    for (const u of [owner, partner]) {
      await app.inject({
        method: "POST",
        url: "/vault/consent",
        headers: { authorization: `Bearer ${u.accessToken}` },
        payload: { userId: u.userId, scope: "FINANCIAL", source: "onboarding" },
      });
    }
    const household = (
      await app.inject({
        method: "POST",
        url: "/households",
        headers: { authorization: `Bearer ${owner.accessToken}` },
        payload: { name: "Cap home" },
      })
    ).json() as Household;
    await app.inject({
      method: "POST",
      url: "/households/join",
      headers: { authorization: `Bearer ${partner.accessToken}` },
      payload: { inviteCode: household.inviteCode },
    });
    const accountId = (
      (
        await app.inject({
          method: "POST",
          url: "/credits",
          headers: { authorization: `Bearer ${owner.accessToken}` },
          payload: { kind: "GIFT_CARD", merchant: "Myntra", currency: "INR", balanceMinor: 2500 },
        })
      ).json() as { id: string }
    ).id;
    await app.inject({
      method: "PATCH",
      url: `/households/${household.id}/vault/members`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { userId: partner.userId, vaultAccess: "SPEND", spendCapMinor: 2000 },
    });
    const spend = (amountMinor: number, idempotencyKey: string) =>
      app.inject({
        method: "POST",
        url: `/households/${household.id}/vault/spend`,
        headers: { authorization: `Bearer ${partner.accessToken}` },
        payload: { accountId, amountMinor, idempotencyKey },
      });
    type SpendBody = { spentMinor: number; balanceMinor: number };

    const [a, b] = await Promise.all([
      spend(1000, "11111111-1111-4111-8111-111111111111"),
      spend(1000, "11111111-1111-4111-8111-111111111111"),
    ]);
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    expect((a.json() as SpendBody).spentMinor).toBe(1000);
    expect((b.json() as SpendBody).spentMinor).toBe(1000);

    const racers = await Promise.all([
      spend(800, "22222222-2222-4222-8222-222222222222"),
      spend(800, "33333333-3333-4333-8333-333333333333"),
    ]);
    expect(racers.map((r) => r.statusCode).sort()).toEqual([200, 403]);
    const won = racers.find((r) => r.statusCode === 200)!.json() as SpendBody;
    expect(won.spentMinor).toBe(1800);
    expect(won.balanceMinor).toBe(700);

    // Owner tops the cap up; the account (700 left) cannot cover 1000.
    await app.inject({
      method: "PATCH",
      url: `/households/${household.id}/vault/members`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { userId: partner.userId, vaultAccess: "SPEND", spendCapMinor: 10_000 },
    });
    const short = await spend(1000, "44444444-4444-4444-8444-444444444444");
    expect(short.statusCode).toBe(409);
    const after = await spend(100, "55555555-5555-4555-8555-555555555555");
    expect(after.statusCode).toBe(200);
    expect((after.json() as SpendBody).spentMinor).toBe(1900);
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

    // Kid closets are blocked until there is a guardian-consent flow.
    const blockedKid = await app.inject({
      method: "POST",
      url: "/closet-profiles",
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { name: "Aarav", kind: "KID" },
    });
    expect(blockedKid.statusCode).toBe(400);

    const kid = await app.inject({
      method: "POST",
      url: "/closet-profiles",
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { name: "Aarav", kind: "PARTNER" },
    });
    expect(kid.statusCode).toBe(201);
    const kidProfile = kid.json() as ClosetProfile;

    const mine = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { category: "blazer", profileId: selfId, imageKeys: [`u/${user.userId}/wardrobe/b.jpg`] },
    });
    const mineId = (mine.json() as WardrobeItem).id;

    const kids = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${user.accessToken}` },
      payload: { category: "tee", profileId: kidProfile.id, imageKeys: [`u/${user.userId}/wardrobe/t.jpg`] },
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

    // An outfit mixing two profiles' items belongs to neither.
    await repos.createOutfit({ userId: user.userId, itemIds: [mineId, kidItemId], occasion: "CASUAL" });
    const afterMixed = await app.inject({
      method: "GET",
      url: `/closet-profiles/${kidProfile.id}/outfits`,
      headers: { authorization: `Bearer ${user.accessToken}` },
    });
    expect((afterMixed.json() as ClosetProfileOutfitsResponse).outfits).toHaveLength(1);
  });

  it("pages a profile's wardrobe and outfits with a cursor", async () => {
    const { app, repos } = await buildTestServer();
    const user = await login(app, "919810000031");
    const auth = { authorization: `Bearer ${user.accessToken}` };
    const list = await app.inject({ method: "GET", url: "/closet-profiles", headers: auth });
    const selfId = (list.json() as ClosetProfileListResponse).activeProfileId!;
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/wardrobe",
        headers: auth,
        payload: { category: `tee ${i}`, profileId: selfId, imageKeys: [] },
      });
      ids.push((res.json() as WardrobeItem).id);
      await repos.createOutfit({ userId: user.userId, itemIds: [ids[i]!], occasion: "CASUAL" });
    }

    const seen: string[] = [];
    let cursor: string | null | undefined;
    do {
      const res = await app.inject({
        method: "GET",
        url: `/closet-profiles/${selfId}/wardrobe?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        headers: auth,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as ClosetProfileWardrobeResponse;
      expect(body.items.length).toBeLessThanOrEqual(2);
      seen.push(...body.items.map((i) => i.id));
      cursor = body.nextCursor;
    } while (cursor);
    expect(seen.sort()).toEqual([...ids].sort());

    const outfitsPage = await app.inject({
      method: "GET",
      url: `/closet-profiles/${selfId}/outfits?limit=2`,
      headers: auth,
    });
    const oBody = outfitsPage.json() as ClosetProfileOutfitsResponse;
    expect(oBody.outfits).toHaveLength(2);
    expect(oBody.nextCursor).toBeTruthy();

    const badCursor = await app.inject({
      method: "GET",
      url: `/closet-profiles/${selfId}/wardrobe?cursor=not-a-cursor`,
      headers: auth,
    });
    expect(badCursor.statusCode).toBe(400);
  });

  it("makes one SELF profile under concurrent first loads, and keeps it the only one", async () => {
    const { app, repos } = await buildTestServer();
    const user = await login(app, "919810000032");
    const auth = { authorization: `Bearer ${user.accessToken}` };
    const loads = await Promise.all(
      [0, 1, 2].map(() => app.inject({ method: "GET", url: "/closet-profiles", headers: auth })),
    );
    expect(loads.every((r) => r.statusCode === 200)).toBe(true);
    const selfRows = (await repos.listClosetProfiles(user.userId)).filter((p) => p.kind === "SELF");
    expect(selfRows).toHaveLength(1);

    // Body kind defaults to SELF, and a second SELF is refused.
    const second = await app.inject({
      method: "POST",
      url: "/closet-profiles",
      headers: auth,
      payload: { name: "Me again" },
    });
    expect(second.statusCode).toBe(409);

    const partner = await app.inject({
      method: "POST",
      url: "/closet-profiles",
      headers: auth,
      payload: { name: "Partner", kind: "PARTNER" },
    });
    const partnerId = (partner.json() as ClosetProfile).id;
    const toKid = await app.inject({
      method: "PATCH",
      url: `/closet-profiles/${partnerId}`,
      headers: auth,
      payload: { kind: "KID" },
    });
    expect(toKid.statusCode).toBe(400);
    const toSelf = await app.inject({
      method: "PATCH",
      url: `/closet-profiles/${partnerId}`,
      headers: auth,
      payload: { kind: "SELF" },
    });
    expect(toSelf.statusCode).toBe(400);
  });

  it("answers 404 for another user's profile on every route", async () => {
    const { app } = await buildTestServer();
    const owner = await login(app, "919810000033");
    const other = await login(app, "919810000034");
    const created = await app.inject({
      method: "POST",
      url: "/closet-profiles",
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { name: "Partner", kind: "PARTNER" },
    });
    const id = (created.json() as ClosetProfile).id;
    const auth = { authorization: `Bearer ${other.accessToken}` };
    const results = await Promise.all([
      app.inject({ method: "PATCH", url: `/closet-profiles/${id}`, headers: auth, payload: { name: "Mine" } }),
      app.inject({ method: "DELETE", url: `/closet-profiles/${id}`, headers: auth }),
      app.inject({ method: "GET", url: `/closet-profiles/${id}/wardrobe`, headers: auth }),
      app.inject({ method: "GET", url: `/closet-profiles/${id}/outfits`, headers: auth }),
    ]);
    expect(results.map((r) => r.statusCode)).toEqual([404, 404, 404, 404]);
    const missing = await app.inject({
      method: "GET",
      url: "/closet-profiles/00000000-0000-4000-8000-0000000000ee/wardrobe",
      headers: auth,
    });
    expect(results[2]!.json()).toEqual(missing.json());
  });
});
