import { describe, expect, it } from "vitest";
import { renderNote } from "../closet-notes.js";
import type { BackupCheck, OutfitSlots } from "../schemas/closet-week.js";
import { BackupSchema, DayPlanSchema } from "../schemas/closet-week.js";
import type { SitePiece } from "../seed/closet-site-week.js";
import { SITE_PIECES, SITE_SEED, SITE_WEEK_START, siteItemId, siteWeekInput } from "../seed/closet-site-week.js";
import { composeWeek } from "./index.js";

/** The Closet page's week, composed from its own closet: the copy on the page is the composer's output. */

const NAMES = new Map((Object.keys(SITE_PIECES) as SitePiece[]).map((p) => [siteItemId(p), p]));
const pieces = (slots: OutfitSlots): Record<string, SitePiece | undefined> =>
  Object.fromEntries(Object.entries(slots).map(([slot, id]) => [slot, NAMES.get(id)]));

function week() {
  const r = composeWeek(siteWeekInput());
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
}

/** `ClosetWeek` cards: the day's plan, the pieces the card names, and its line. */
const DAYS: { date: string; label: string; why: string; card: SitePiece[]; look: Record<string, SitePiece> }[] = [
  {
    date: "2026-11-09", label: "Lunch at 1 · 31°", why: "Light and bare-shouldered for a hot lunch.",
    card: ["sage", "wedges", "hoops"],
    look: { DRESS: "sage", FOOTWEAR: "wedges", BAG: "strawBag", EARRINGS: "hoops" },
  },
  {
    date: "2026-11-10", label: "Offsite, all day", why: "Polished in the room, easy for nine hours.",
    card: ["stripedMidi", "sneakers"],
    look: { DRESS: "stripedMidi", FOOTWEAR: "sneakers", BAG: "clutch" },
  },
  {
    date: "2026-11-11", label: "Work from home · gym at 7", why: "Calls on camera, then straight out the door.",
    card: ["greyTop", "greyBottom", "runners"],
    look: { COORD_TOP: "greyTop", COORD_BOTTOM: "greyBottom", FOOTWEAR: "runners" },
  },
  {
    date: "2026-11-12", label: "Dinner at 8", why: "Out for the first time since June.",
    card: ["redMini", "heels"],
    look: { DRESS: "redMini", FOOTWEAR: "heels", BAG: "clutch", EARRINGS: "drops" },
  },
  {
    date: "2026-11-13", label: "Office, then drinks", why: "Desk to drinks without going home.",
    card: ["yellowMidi", "wedges"],
    look: { DRESS: "yellowMidi", FOOTWEAR: "wedges", BAG: "clutch", EARRINGS: "drops" },
  },
  {
    date: "2026-11-14", label: "Brunch, then a long walk", why: "Cool for the heat, and a bag for the day.",
    card: ["linenShirt", "shorts", "strawBag"],
    look: { TOP: "linenShirt", BOTTOM: "shorts", FOOTWEAR: "sneakers", BAG: "strawBag" },
  },
  {
    date: "2026-11-15", label: "Slow day", why: "Nothing to think about.",
    card: ["creamTop", "creamBottom", "slides"],
    look: { COORD_TOP: "creamTop", COORD_BOTTOM: "creamBottom", FOOTWEAR: "slides" },
  },
];

/** `ClosetBackups` lines and `ClosetStylist` looks: the pieces laid out, and the stylist's note. */
const BACKUPS: { check: BackupCheck; why: string; fitsDays: string[]; laid: SitePiece[]; look: Record<string, SitePiece>; note: string }[] = [
  {
    check: "NOT_WAXED", why: "Monday’s strapless mini shows shoulders, underarms and legs.",
    fitsDays: ["2026-11-09", "2026-11-12", "2026-11-13", "2026-11-15"],
    laid: ["whiteTee", "trousers", "wedges", "hoops"],
    look: { TOP: "whiteTee", BOTTOM: "trousers", FOOTWEAR: "wedges", BAG: "strawBag", EARRINGS: "hoops" },
    note: "Floor-length linen and a crisp tee. It reads as a choice, not a cover-up.",
  },
  {
    check: "BLOATED", why: "The sage mini is ruched and tight through the waist and hips.",
    fitsDays: ["2026-11-09", "2026-11-12", "2026-11-13", "2026-11-15"],
    laid: ["hoops", "creamMidi", "wedges", "strawBag"],
    look: { DRESS: "creamMidi", FOOTWEAR: "wedges", BAG: "strawBag", EARRINGS: "hoops" },
    note: "Nothing at the waist today. Cream linen falls from the shoulder, and the wedges keep it dressed.",
  },
  {
    check: "BAD_HAIR", why: "The look was built around hair down and blow-dried.",
    fitsDays: ["2026-11-09", "2026-11-10", "2026-11-12", "2026-11-13", "2026-11-15"],
    laid: ["clawClip", "blackKnit", "wedges", "strawBag"],
    look: { DRESS: "blackKnit", FOOTWEAR: "wedges", BAG: "strawBag", HAIR_ACCESSORY: "clawClip" },
    note: "Hair goes up in the claw clip, so the neckline does the talking. Black knit, nothing fussy.",
  },
  {
    check: "PARTY_DATE", why: "Sage and a straw bag, planned for lunch at 1 in 31°.",
    fitsDays: ["2026-11-09"],
    laid: ["drops", "slip", "wedges", "clutch"],
    look: { DRESS: "slip", FOOTWEAR: "wedges", BAG: "clutch", EARRINGS: "drops" },
    note: "Black satin after six. Gold drops, the clutch, and the same wedges, so it’s dinner, not a gala.",
  },
];

describe("the Closet page's week", () => {
  const plan = week();

  it("is the fixture's week, seeded, and the same every time", () => {
    expect(plan.weekStart).toBe(SITE_WEEK_START);
    expect(plan.seed).toBe(String(SITE_SEED));
    expect(week()).toEqual(plan);
    for (const day of plan.days) DayPlanSchema.parse(day);
    for (const backup of plan.backups) BackupSchema.parse(backup);
  });

  it.each(DAYS.map((d, i) => [d.date, i] as const))("%s matches its week card", (_date, i) => {
    const want = DAYS[i]!;
    const day = plan.days[i]!;
    expect(day.date).toBe(want.date);
    expect(day.context.label).toBe(want.label);
    expect(day.outfit.note).toBe(want.why);
    expect(day.outfit.status).toBe("PROPOSED");
    expect(day.locked).toBe(false);
    const look = pieces(day.outfit.slots);
    expect(look).toEqual(want.look);
    expect(Object.values(look)).toEqual(expect.arrayContaining(want.card));
  });

  it("gives Monday the stylist's look and note", () => {
    const monday = plan.days[0]!.outfit;
    expect(Object.values(pieces(monday.slots)).sort()).toEqual(["hoops", "sage", "strawBag", "wedges"]);
    expect(renderNote(monday.noteReasons)).toBe("Sage and tan, same warmth. Gold hoops because the neckline’s bare.");
  });

  it("never plans the tee in the wash", () => {
    const navyTee = siteItemId("navyTee");
    const looks = [...plan.days.map((d) => d.outfit), ...plan.backups.map((b) => b.outfit)];
    for (const outfit of looks) expect(Object.values(outfit?.slots ?? {})).not.toContain(navyTee);
  });

  it.each(BACKUPS.map((b, i) => [b.check, i] as const))("has the %s backup the page shows", (check, i) => {
    const want = BACKUPS[i]!;
    const backup = plan.backups[i]!;
    expect(backup.check).toBe(check);
    expect(backup.status).toBe("READY");
    expect(backup.missing).toBeNull();
    expect(backup.forDay).toBe("2026-11-09");
    expect(backup.fitsDays).toEqual(want.fitsDays);
    expect(backup.why).toBe(want.why);
    expect(backup.outfit?.kind).toBe("BACKUP");
    expect(backup.outfit?.note).toBe(want.note);
    const look = pieces(backup.outfit?.slots ?? {});
    expect(look).toEqual(want.look);
    expect(Object.values(look)).toEqual(expect.arrayContaining(want.laid));
  });
});
