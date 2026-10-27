import { z } from "zod";

/** `?limit&cursor` for keyset-paged lists. `cursor` is opaque: pass back `nextCursor` as is. */
export const PageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(512).optional(),
});
export type PageQuery = z.infer<typeof PageQuerySchema>;

/** `{ items, nextCursor }`; `nextCursor` is null on the last page. */
export function pageResponse<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().nullable(),
  });
}
export type PageResponse<T> = { items: T[]; nextCursor: string | null };
