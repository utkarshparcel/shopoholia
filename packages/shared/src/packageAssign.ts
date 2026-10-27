/**
 * U030 — Assign incoming package to a household member (shared address).
 */

import {
  denyUnlessHouseholdMember,
  type HouseholdMembershipLike,
} from "./household.js";

export type PackageAssignDenial =
  | "NOT_MEMBER"
  | "ASSIGNEE_NOT_MEMBER"
  | "OUTSIDER"
  | "SELF_ONLY_WITHOUT_HOUSEHOLD";

export function canAssignPackage(input: {
  actorUserId: string;
  assigneeUserId: string;
  members: Iterable<HouseholdMembershipLike | string>;
}): PackageAssignDenial | null {
  const actorDenied = denyUnlessHouseholdMember(input.members, input.actorUserId);
  if (actorDenied) return "NOT_MEMBER";
  const assigneeDenied = denyUnlessHouseholdMember(input.members, input.assigneeUserId);
  if (assigneeDenied) return "ASSIGNEE_NOT_MEMBER";
  return null;
}

export function packageAssignedPushCopy(input: {
  merchant: string;
  assignerLabel?: string | null;
}): { title: string; body: string } {
  const who = input.assignerLabel?.trim() || "A household member";
  return {
    title: "Package assigned to you",
    body: `${who} assigned a ${input.merchant} delivery to you.`,
  };
}

export function packageAssigneeChipLabel(input: {
  assigneeUserId: string | null | undefined;
  selfUserId: string;
  memberLabels?: Record<string, string>;
}): string | null {
  if (!input.assigneeUserId) return null;
  if (input.assigneeUserId === input.selfUserId) return "You";
  return input.memberLabels?.[input.assigneeUserId] ?? "Household member";
}
