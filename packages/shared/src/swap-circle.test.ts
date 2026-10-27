import { describe, expect, it } from "vitest";
import {
  buildSwapInviteDeepLink,
  buildSwapInvitePayload,
  buildSwapInviteUrl,
  denyUnlessCanBorrow,
  denyUnlessCanReturn,
  denyUnlessCircleMember,
  generateSwapInviteCode,
  isSwapCircleMember,
  normalizeSwapInviteCode,
} from "./swap-circle.js";

describe("N37 swap circle invite link", () => {
  it("builds worn.app invite URL and deep link", () => {
    expect(buildSwapInviteUrl("ab12cd34")).toBe("https://worn.app/c/AB12CD34");
    expect(buildSwapInviteDeepLink("ab12cd34")).toBe("worn://swap-circle/AB12CD34");
    const payload = buildSwapInvitePayload("xy99zz");
    expect(payload.inviteCode).toBe("XY99ZZ");
    expect(payload.inviteUrl).toContain("worn.app/c/XY99ZZ");
    expect(payload.deepLink).toContain("worn://swap-circle/XY99ZZ");
  });

  it("normalizes invite codes", () => {
    expect(normalizeSwapInviteCode(" ab-12 ")).toBe("AB12");
    expect(generateSwapInviteCode(8)).toMatch(/^[A-Z0-9]{8}$/);
  });
});

describe("N37 swap circle membership authz", () => {
  const members = [
    { userId: "owner-1", role: "OWNER" },
    { userId: "friend-2", role: "MEMBER" },
  ];

  it("allows members and denies outsiders", () => {
    expect(isSwapCircleMember(members, "friend-2")).toBe(true);
    expect(denyUnlessCircleMember(members, "friend-2")).toBeNull();
    expect(denyUnlessCircleMember(members, "outsider")).toBe("NOT_MEMBER");
    expect(isSwapCircleMember(["owner-1"], "outsider")).toBe(false);
  });

  it("allows borrow only for non-owner members on LISTED items", () => {
    const listing = { ownerUserId: "owner-1", status: "LISTED", borrowerUserId: null };
    expect(denyUnlessCanBorrow(members, listing, "friend-2")).toBeNull();
    expect(denyUnlessCanBorrow(members, listing, "owner-1")).toBe("OWN_ITEM");
    expect(denyUnlessCanBorrow(members, listing, "outsider")).toBe("NOT_MEMBER");
    expect(
      denyUnlessCanBorrow(members, { ...listing, status: "BORROWED" }, "friend-2"),
    ).toBe("NOT_LISTED");
  });

  it("allows return for borrower or owner only", () => {
    const listing = {
      ownerUserId: "owner-1",
      status: "BORROWED",
      borrowerUserId: "friend-2",
    };
    expect(denyUnlessCanReturn(members, listing, "friend-2")).toBeNull();
    expect(denyUnlessCanReturn(members, listing, "owner-1")).toBeNull();
    expect(denyUnlessCanReturn(members, listing, "outsider")).toBe("NOT_MEMBER");
    expect(
      denyUnlessCanReturn(
        [...members, { userId: "other-3", role: "MEMBER" }],
        listing,
        "other-3",
      ),
    ).toBe("NOT_BORROWER");
  });
});
