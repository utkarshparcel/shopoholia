import { describe, expect, it } from "vitest";
import { returnLabelOfflineHint, returnLabelState } from "./returnLabel.js";

describe("U029 return label", () => {
  it("marks ready when image present and unused", () => {
    const s = returnLabelState({ labelImageKey: "returns/u1/r1/label.jpg" });
    expect(s.readyForAgent).toBe(true);
    expect(returnLabelOfflineHint(true)).toMatch(/offline/i);
  });

  it("not ready after mark used", () => {
    const s = returnLabelState({
      labelImageKey: "returns/u1/r1/label.jpg",
      labelUsedAt: "2026-08-27T10:00:00.000Z",
    });
    expect(s.readyForAgent).toBe(false);
    expect(s.usedAt).toContain("2026-08-27");
  });
});
