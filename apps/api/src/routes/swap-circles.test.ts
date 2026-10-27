import { describe, expect, it } from "vitest";
import type {
  SwapCircle,
  SwapCircleDetailResponse,
  SwapCircleListResponse,
  SwapInviteResponse,
  SwapListing,
  SwapListingsResponse,
  WardrobeItem,
} from "@worn/shared";
import { buildTestServer, login } from "../test-utils.js";

describe("N37 swap circle", () => {
  it("creates circle with invite link; member can list/borrow; outsider denied", async () => {
    const { app } = await buildTestServer();
    const owner = await login(app, "919800000001");
    const friend = await login(app, "919800000002");
    const outsider = await login(app, "919800000003");

    const created = await app.inject({
      method: "POST",
      url: "/swap-circles",
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { name: "Flat swap" },
    });
    expect(created.statusCode).toBe(201);
    const circle = created.json() as SwapCircle;
    expect(circle.inviteCode).toMatch(/^[A-Z0-9]{8}$/);
    expect(circle.ownerId).toBe(owner.userId);

    const invite = await app.inject({
      method: "GET",
      url: `/swap-circles/${circle.id}/invite`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(invite.statusCode).toBe(200);
    const inviteBody = invite.json() as SwapInviteResponse;
    expect(inviteBody.inviteUrl).toBe(`https://worn.app/c/${circle.inviteCode}`);
    expect(inviteBody.deepLink).toBe(`worn://swap-circle/${circle.inviteCode}`);

    // Outsider cannot view circle (membership authz)
    const denied = await app.inject({
      method: "GET",
      url: `/swap-circles/${circle.id}`,
      headers: { authorization: `Bearer ${outsider.accessToken}` },
    });
    expect(denied.statusCode).toBe(403);
    expect((denied.json() as { message: string }).message).toMatch(/Not a member/i);

    const joined = await app.inject({
      method: "POST",
      url: "/swap-circles/join",
      headers: { authorization: `Bearer ${friend.accessToken}` },
      payload: { inviteCode: circle.inviteCode.toLowerCase() },
    });
    expect(joined.statusCode).toBe(200);
    const detail = joined.json() as SwapCircleDetailResponse;
    expect(detail.members.length).toBe(2);
    expect(detail.role).toBe("MEMBER");

    const itemRes = await app.inject({
      method: "POST",
      url: "/wardrobe",
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: {
        category: "jacket",
        costMinor: 5000,
        imageKeys: ["j.jpg"],
        garmentImageKey: "j.jpg",
      },
    });
    const itemId = (itemRes.json() as WardrobeItem).id;

    const listItem = await app.inject({
      method: "POST",
      url: `/swap-circles/${circle.id}/listings`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { wardrobeItemId: itemId },
    });
    expect(listItem.statusCode).toBe(201);
    const listing = listItem.json() as SwapListing;
    expect(listing.status).toBe("LISTED");
    expect(listing.dispositionListingId).toBeTruthy();

    // Outsider cannot list or borrow
    const outsiderList = await app.inject({
      method: "GET",
      url: `/swap-circles/${circle.id}/listings`,
      headers: { authorization: `Bearer ${outsider.accessToken}` },
    });
    expect(outsiderList.statusCode).toBe(403);

    const outsiderBorrow = await app.inject({
      method: "POST",
      url: `/swap-circles/${circle.id}/listings/${listing.id}/borrow`,
      headers: { authorization: `Bearer ${outsider.accessToken}` },
    });
    expect(outsiderBorrow.statusCode).toBe(403);

    // Owner cannot borrow own item
    const selfBorrow = await app.inject({
      method: "POST",
      url: `/swap-circles/${circle.id}/listings/${listing.id}/borrow`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(selfBorrow.statusCode).toBe(403);

    const borrow = await app.inject({
      method: "POST",
      url: `/swap-circles/${circle.id}/listings/${listing.id}/borrow`,
      headers: { authorization: `Bearer ${friend.accessToken}` },
    });
    expect(borrow.statusCode).toBe(200);
    const borrowed = borrow.json() as SwapListing;
    expect(borrowed.status).toBe("BORROWED");
    expect(borrowed.borrowerUserId).toBe(friend.userId);

    const listings = await app.inject({
      method: "GET",
      url: `/swap-circles/${circle.id}/listings`,
      headers: { authorization: `Bearer ${friend.accessToken}` },
    });
    expect(listings.statusCode).toBe(200);
    expect((listings.json() as SwapListingsResponse).listings[0]?.status).toBe("BORROWED");

    const returned = await app.inject({
      method: "POST",
      url: `/swap-circles/${circle.id}/listings/${listing.id}/return`,
      headers: { authorization: `Bearer ${friend.accessToken}` },
    });
    expect(returned.statusCode).toBe(200);
    expect((returned.json() as SwapListing).status).toBe("RETURNED");

    const mine = await app.inject({
      method: "GET",
      url: "/swap-circles",
      headers: { authorization: `Bearer ${friend.accessToken}` },
    });
    expect(mine.statusCode).toBe(200);
    expect((mine.json() as SwapCircleListResponse).circles.length).toBe(1);

    await app.close();
  });

  it("invalid invite code returns 404", async () => {
    const { app } = await buildTestServer();
    const { accessToken } = await login(app);
    const res = await app.inject({
      method: "POST",
      url: "/swap-circles/join",
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { inviteCode: "NOPECODE" },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
