import { describe, expect, it } from "vitest";
import * as shared from "./index.js";

describe("package exports", () => {
  it("re-exports core modules", () => {
    expect(shared.ONBOARDING_COIN_GRANT).toBe(500);
    expect(shared.OtpRequestSchema).toBeDefined();
    expect(shared.AvatarStatusSchema).toBeDefined();
    expect(shared.OrderState).toBeDefined();
  });
});
