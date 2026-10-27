import { z } from "zod";
import { LocalDateSchema } from "./closet-item.js";

/** Local wall-clock time, "13:00". */
export const LocalTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export type LocalTime = z.infer<typeof LocalTimeSchema>;

export const CalendarTagKindSchema = z.enum([
  "OFFICE", "WFH", "OFFSITE", "MEETING", "INTERVIEW",
  "BRUNCH", "LUNCH", "DINNER", "DRINKS", "DATE", "PARTY", "WEDDING", "FESTIVE",
  "GYM", "WALK", "TRAVEL", "OTHER",
]);
export type CalendarTagKind = z.infer<typeof CalendarTagKindSchema>;

/** One calendar event, reduced on the phone. Strict: titles, attendees and places can't be sent. */
export const CalendarTagSchema = z
  .object({
    startLocal: LocalTimeSchema.nullable(),
    endLocal: LocalTimeSchema.nullable(),
    kind: CalendarTagKindSchema,
    formality: z.number().int().min(1).max(5).nullable(),
    outdoor: z.boolean(),
    allDay: z.boolean(),
  })
  .strict();
export type CalendarTag = z.infer<typeof CalendarTagSchema>;

/** `PUT /context/calendar`. */
export const CalendarTagsPutSchema = z
  .object({
    days: z.array(z.object({ date: LocalDateSchema, tags: z.array(CalendarTagSchema).max(12) }).strict()).max(14),
  })
  .strict();
export type CalendarTagsPut = z.infer<typeof CalendarTagsPutSchema>;

/** Same values as the universe's `WeatherCtx.condition`. */
export const WeatherConditionSchema = z.enum(["sunny", "partly_cloudy", "cloudy", "rain", "humid", "clear"]);
export type WeatherCondition = z.infer<typeof WeatherConditionSchema>;

export const WeatherDaySchema = z.object({
  date: LocalDateSchema,
  tempMinC: z.number().nullable(),
  tempMaxC: z.number().nullable(),
  rainChance: z.number().min(0).max(1).nullable(),
  condition: WeatherConditionSchema.nullable(),
  provider: z.string(),
});
export type WeatherDay = z.infer<typeof WeatherDaySchema>;

/** What the composer is told about one day. It never fetches or infers this itself. */
export const ClosetDayContextSchema = z.object({
  date: LocalDateSchema,
  weather: WeatherDaySchema.nullable(),
  events: z.array(CalendarTagSchema).max(12),
});
export type ClosetDayContext = z.infer<typeof ClosetDayContextSchema>;
