import { describe, expect, it } from "vitest";
import {
  buildHouseholdInviteDeepLink,
  buildHouseholdInvitePayload,
  buildHouseholdInviteUrl,
  denyUnlessCanAccessHouseholdWardrobe,
  denyUnlessHouseholdMember,
  denyUnlessHouseholdOwner,
  generateHouseholdInviteCode,
  householdMemberUserIds,
  isHouseholdMember,
  normalizeHouseholdInviteCode,
  friendlyHouseholdAclCopy,
  activeHouseholdSwitcherLabel,
} from "./household.js";

describe("household (N26)", () => {
  it("generates and normalizes invite codes", () => {
    const code = generateHouseholdInviteCode(8);
    expect(code).toHaveLength(8);
    expect(generateHouseholdInviteCode(2)).toHaveLength(4); // clamped min
    expect(generateHouseholdInviteCode(99)).toHaveLength(16); // clamped max
    expect(normalizeHouseholdInviteCode(" ab-cd ")).toBe("ABCD");
  });

  it("builds web + deep invite URLs", () => {
    expect(buildHouseholdInviteUrl("ab12cd34")).toContain("/AB12CD34");
    expect(buildHouseholdInviteDeepLink("ab12cd34")).toBe("worn://household/AB12CD34");
    const payload = buildHouseholdInvitePayload("xy99");
    expect(payload.inviteCode).toBe("XY99");
    expect(payload.inviteUrl).toContain("XY99");
    expect(payload.deepLink).toContain("XY99");
  });

  it("membership + owner authz", () => {
    const members = [
      { userId: "u1", role: "OWNER" },
      { userId: "u2", role: "MEMBER" },
    ];
    expect(isHouseholdMember(members, "u2")).toBe(true);
    expect(isHouseholdMember(["u3"], "u3")).toBe(true);
    expect(denyUnlessHouseholdMember(members, "u9")).toBe("NOT_MEMBER");
    expect(denyUnlessHouseholdMember(members, "u1")).toBeNull();
    expect(denyUnlessHouseholdOwner(members, "u1")).toBeNull();
    expect(denyUnlessHouseholdOwner(members, "u2")).toBe("NOT_OWNER");
    expect(denyUnlessHouseholdOwner(members, "u9")).toBe("NOT_MEMBER");
  });

  it("shared wardrobe ACL + member id list", () => {
    const members = ["u1", "u2"];
    expect(denyUnlessCanAccessHouseholdWardrobe(members, "u1", "u2")).toBeNull();
    expect(denyUnlessCanAccessHouseholdWardrobe(members, "u1", "u9")).toBe("NOT_MEMBER");
    expect(denyUnlessCanAccessHouseholdWardrobe(members, "u9", "u1")).toBe("OUTSIDER");
    expect(householdMemberUserIds([{ userId: "u1" }, "u1", "u2"])).toEqual(["u1", "u2"]);
  });

  it("friendly ACL copy + switcher label (W064)", () => {
    expect(friendlyHouseholdAclCopy("NOT_MEMBER")).toMatch(/not in this household/i);
    expect(friendlyHouseholdAclCopy("not a member of household")).toMatch(/invite/i);
    expect(friendlyHouseholdAclCopy("NOT_OWNER")).toMatch(/only the household owner/i);
    expect(friendlyHouseholdAclCopy("OUTSIDER")).toMatch(/shared closet/i);
    expect(friendlyHouseholdAclCopy("403 Forbidden")).toMatch(/don’t have access/i);
    expect(friendlyHouseholdAclCopy(null)).toMatch(/don’t have access/i);
    expect(friendlyHouseholdAclCopy("custom deny")).toBe("custom deny");
    expect(activeHouseholdSwitcherLabel(null)).toBe("No household selected");
    expect(activeHouseholdSwitcherLabel({ name: "  " })).toBe("No household selected");
    expect(activeHouseholdSwitcherLabel({ name: "Ours" })).toBe("Active: Ours");
  });
});
