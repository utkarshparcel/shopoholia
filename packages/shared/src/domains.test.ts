import { describe, expect, it } from "vitest";
import {
  API_ORIGIN,
  CLOSET_URL,
  MEDIA_ORIGIN,
  PRIVACY_EMAIL,
  SUPPORT_EMAIL,
  WEB_HOST,
  WEB_ORIGIN,
  WEB_PRIVACY_URL,
} from "./domains.js";
import { FAMILY_SHARE_ORIGIN } from "./family-share.js";
import { buildHouseholdInviteUrl } from "./household.js";
import { buildSwapInviteUrl } from "./swap-circle.js";
import { WASTE_SHARE_WATERMARK } from "./waste.js";

describe("production domains", () => {
  it("pins every public host under worncloset.app", () => {
    expect(WEB_HOST).toBe("worncloset.app");
    expect(WEB_ORIGIN).toBe("https://worncloset.app");
    expect(CLOSET_URL).toBe("https://worncloset.app/closet");
    expect(API_ORIGIN).toBe("https://api.worncloset.app");
    expect(MEDIA_ORIGIN).toBe("https://media.worncloset.app");
    expect(WEB_PRIVACY_URL).toBe("https://worncloset.app/privacy");
    expect(SUPPORT_EMAIL).toBe("hello@worncloset.app");
    expect(PRIVACY_EMAIL).toBe("privacy@worncloset.app");
  });

  it("is the host behind share links and watermarks", () => {
    expect(FAMILY_SHARE_ORIGIN).toBe(WEB_ORIGIN);
    expect(WASTE_SHARE_WATERMARK).toBe(WEB_HOST);
    expect(buildSwapInviteUrl("ab12cd34")).toBe("https://worncloset.app/c/AB12CD34");
    expect(buildHouseholdInviteUrl("ab12cd34")).toBe("https://worncloset.app/h/AB12CD34");
  });
});
