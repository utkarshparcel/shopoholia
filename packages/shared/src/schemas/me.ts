import { z } from "zod";

/** `PUT /me/time-zone`. The route rejects names `isValidTimeZone` refuses with 400 `invalid_time_zone`. */
export const UpdateTimeZoneBodySchema = z.object({
  timeZone: z.string().min(1).max(64),
});
export type UpdateTimeZoneBody = z.infer<typeof UpdateTimeZoneBodySchema>;

export const TimeZoneResponseSchema = z.object({
  timeZone: z.string(),
});
export type TimeZoneResponse = z.infer<typeof TimeZoneResponseSchema>;
