import { z } from "zod";

export const SwapCircleRoleSchema = z.enum(["OWNER", "MEMBER"]);
export type SwapCircleRole = z.infer<typeof SwapCircleRoleSchema>;

export const SwapListingStatusSchema = z.enum([
  "LISTED",
  "BORROWED",
  "RETURNED",
  "CANCELLED",
]);
export type SwapListingStatus = z.infer<typeof SwapListingStatusSchema>;

export const SwapCircleMemberSchema = z.object({
  id: z.string().uuid(),
  circleId: z.string().uuid(),
  userId: z.string().uuid(),
  role: SwapCircleRoleSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type SwapCircleMember = z.infer<typeof SwapCircleMemberSchema>;

export const SwapCircleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(80),
  ownerId: z.string().uuid(),
  inviteCode: z.string().min(4).max(16),
  memberCount: z.number().int().nonnegative().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type SwapCircle = z.infer<typeof SwapCircleSchema>;

export const SwapListingSchema = z.object({
  id: z.string().uuid(),
  circleId: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  wardrobeItemId: z.string().uuid(),
  dispositionListingId: z.string().uuid().nullable(),
  status: SwapListingStatusSchema,
  borrowerUserId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type SwapListing = z.infer<typeof SwapListingSchema>;

export const CreateSwapCircleBodySchema = z.object({
  name: z.string().min(1).max(80),
});
export type CreateSwapCircleBody = z.infer<typeof CreateSwapCircleBodySchema>;

export const JoinSwapCircleBodySchema = z.object({
  inviteCode: z.string().min(4).max(16),
});
export type JoinSwapCircleBody = z.infer<typeof JoinSwapCircleBodySchema>;

export const CreateSwapListingBodySchema = z.object({
  wardrobeItemId: z.string().uuid(),
});
export type CreateSwapListingBody = z.infer<typeof CreateSwapListingBodySchema>;

export const SwapCircleListResponseSchema = z.object({
  circles: z.array(SwapCircleSchema),
});
export type SwapCircleListResponse = z.infer<typeof SwapCircleListResponseSchema>;

export const SwapCircleDetailResponseSchema = z.object({
  circle: SwapCircleSchema,
  members: z.array(SwapCircleMemberSchema),
  role: SwapCircleRoleSchema,
});
export type SwapCircleDetailResponse = z.infer<typeof SwapCircleDetailResponseSchema>;

export const SwapInviteResponseSchema = z.object({
  inviteCode: z.string().min(4).max(16),
  inviteUrl: z.string().url(),
  deepLink: z.string().min(1),
});
export type SwapInviteResponse = z.infer<typeof SwapInviteResponseSchema>;

export const SwapListingsResponseSchema = z.object({
  listings: z.array(SwapListingSchema),
});
export type SwapListingsResponse = z.infer<typeof SwapListingsResponseSchema>;
