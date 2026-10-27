import { z } from "zod";
import { OutfitSchema, WardrobeItemSchema } from "./wardrobe.js";

export const ClosetProfileKindSchema = z.enum(["SELF", "PARTNER", "KID", "OTHER"]);
export type ClosetProfileKind = z.infer<typeof ClosetProfileKindSchema>;

export const ClosetProfileSchema = z.object({
  id: z.string().uuid(),
  ownerUserId: z.string().uuid(),
  householdId: z.string().uuid().nullable(),
  name: z.string().min(1).max(80),
  kind: ClosetProfileKindSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ClosetProfile = z.infer<typeof ClosetProfileSchema>;

export const CreateClosetProfileBodySchema = z.object({
  name: z.string().min(1).max(80),
  kind: ClosetProfileKindSchema.optional().default("SELF"),
  householdId: z.string().uuid().optional().nullable(),
});
export type CreateClosetProfileBody = z.infer<typeof CreateClosetProfileBodySchema>;

export const UpdateClosetProfileBodySchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    kind: ClosetProfileKindSchema.optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "At least one field required" });
export type UpdateClosetProfileBody = z.infer<typeof UpdateClosetProfileBodySchema>;

export const ClosetProfileListResponseSchema = z.object({
  profiles: z.array(ClosetProfileSchema),
  /** Currently selected profile id (client hint; optional). */
  activeProfileId: z.string().uuid().nullable().optional(),
});
export type ClosetProfileListResponse = z.infer<typeof ClosetProfileListResponseSchema>;

export const ClosetProfileWardrobeResponseSchema = z.object({
  profileId: z.string().uuid(),
  items: z.array(WardrobeItemSchema),
  nextCursor: z.string().nullable().optional(),
});
export type ClosetProfileWardrobeResponse = z.infer<typeof ClosetProfileWardrobeResponseSchema>;

export const ClosetProfileOutfitsResponseSchema = z.object({
  profileId: z.string().uuid(),
  outfits: z.array(OutfitSchema),
  nextCursor: z.string().nullable().optional(),
});
export type ClosetProfileOutfitsResponse = z.infer<typeof ClosetProfileOutfitsResponseSchema>;
