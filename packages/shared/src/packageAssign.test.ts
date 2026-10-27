import { describe, expect, it } from "vitest";
import {
  canAssignPackage,
  packageAssigneeChipLabel,
  packageAssignedPushCopy,
} from "./packageAssign.js";

describe("U030 package household assign", () => {
  const members = [{ userId: "u1", role: "OWNER" }, { userId: "u2", role: "MEMBER" }];

  it("allows assign within household ACL", () => {
    expect(
      canAssignPackage({ actorUserId: "u1", assigneeUserId: "u2", members }),
    ).toBeNull();
  });

  it("denies outsider actor or assignee", () => {
    expect(
      canAssignPackage({ actorUserId: "u9", assigneeUserId: "u2", members }),
    ).toBe("NOT_MEMBER");
    expect(
      canAssignPackage({ actorUserId: "u1", assigneeUserId: "u9", members }),
    ).toBe("ASSIGNEE_NOT_MEMBER");
  });

  it("builds notify copy + chip label", () => {
    expect(packageAssignedPushCopy({ merchant: "Amazon", assignerLabel: "Priya" }).body).toMatch(
      /Priya.*Amazon/i,
    );
    expect(
      packageAssigneeChipLabel({
        assigneeUserId: "u2",
        selfUserId: "u1",
        memberLabels: { u2: "Dev" },
      }),
    ).toBe("Dev");
    expect(
      packageAssigneeChipLabel({ assigneeUserId: "u1", selfUserId: "u1" }),
    ).toBe("You");
  });
});
