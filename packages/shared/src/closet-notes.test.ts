import { describe, expect, it } from "vitest";
import {
  BACKUP_WHY_NONE,
  backupMissing,
  backupWhy,
  cap,
  CHECK_COPY,
  clock,
  DAY_LINES,
  dayLabel,
  eventMinutes,
  eventPhrase,
  joinList,
  NOTE_LINES,
  notableTemp,
  PLANS_PHRASE,
  renderDayLine,
  renderNote,
  RESTYLE_NONE,
  RESTYLE_PASSES,
  sortEvents,
} from "./closet-notes.js";
import type { CalendarTag } from "./schemas/closet-context.js";
import type { NoteReason } from "./schemas/closet-week.js";

function tag(kind: CalendarTag["kind"], start: string | null, end: string | null, more: Partial<CalendarTag> = {}): CalendarTag {
  return { startLocal: start, endLocal: end, kind, formality: null, outdoor: false, allDay: false, ...more };
}

describe("text helpers", () => {
  it("capitalises and joins lists", () => {
    expect(cap("sage")).toBe("Sage");
    expect(joinList([])).toBe("");
    expect(joinList(["legs"])).toBe("legs");
    expect(joinList(["a", "b"])).toBe("a and b");
    expect(joinList(["a", "b", "c"])).toBe("a, b and c");
  });

  it("reads clock times the way the site does", () => {
    expect(clock("13:00")).toBe("1");
    expect(clock("00:00")).toBe("12");
    expect(clock("12:00")).toBe("12");
    expect(clock("19:30")).toBe("7:30");
  });

  it("measures events, across midnight too, and null when an end is unknown", () => {
    expect(eventMinutes(tag("LUNCH", "13:00", "14:30"))).toBe(90);
    expect(eventMinutes(tag("PARTY", "22:00", "01:00"))).toBe(180);
    expect(eventMinutes(tag("LUNCH", null, "14:30"))).toBeNull();
    expect(eventMinutes(tag("LUNCH", "13:00", null))).toBeNull();
  });

  it("shows the temperature only at 30 °C and above or 15 °C and below", () => {
    expect(notableTemp(null)).toBe(false);
    expect(notableTemp(30)).toBe(true);
    expect(notableTemp(15)).toBe(true);
    expect(notableTemp(22)).toBe(false);
  });

  it("phrases timed and untimed events", () => {
    expect(eventPhrase(tag("LUNCH", "13:00", "14:30"))).toBe("lunch at 1");
    expect(eventPhrase(tag("OFFICE", "09:00", "17:00", { allDay: true }))).toBe("the office");
    expect(eventPhrase(tag("INTERVIEW", null, null))).toBe("an interview");
  });
});

describe("sortEvents", () => {
  it("puts all-day events first, then timed by start, then untimed", () => {
    const untimed = tag("OTHER", null, null);
    const late = tag("DINNER", "20:00", "22:00");
    const early = tag("LUNCH", "13:00", "14:00");
    const allDay = tag("WFH", null, null, { allDay: true });
    expect(sortEvents([untimed, late, early, allDay])).toEqual([allDay, early, late, untimed]);
  });

  it("orders ties on every field, so input order never matters", () => {
    const a = tag("LUNCH", "13:00", "14:00");
    const b = tag("BRUNCH", "13:00", "14:00");
    const noEnd = tag("LUNCH", "13:00", null);
    const formal = tag("LUNCH", "13:00", "14:00", { formality: 3 });
    const outdoor = tag("LUNCH", "13:00", "14:00", { outdoor: true });
    const all = [a, b, noEnd, formal, outdoor];
    const sorted = sortEvents(all);
    expect(sorted).toEqual([b, a, outdoor, formal, noEnd]);
    expect(sortEvents([...all].reverse())).toEqual(sorted);
    expect(sortEvents([a, { ...a }])).toEqual([a, a]);
  });
});

describe("dayLabel", () => {
  it("writes the site's labels", () => {
    expect(dayLabel([tag("LUNCH", "13:00", "14:30")], 31)).toBe("Lunch at 1 · 31°");
    expect(dayLabel([tag("OFFSITE", "09:00", "18:00", { allDay: true })], 21)).toBe("Offsite, all day");
    expect(dayLabel([tag("WFH", null, null, { allDay: true }), tag("GYM", "19:00", "20:00")], 24)).toBe(
      "Work from home · gym at 7",
    );
    expect(dayLabel([tag("DINNER", "20:00", "22:30")], 26)).toBe("Dinner at 8");
    expect(dayLabel([tag("DRINKS", "19:00", "21:00"), tag("OFFICE", "09:30", "17:00")], 25)).toBe(
      "Office, then drinks",
    );
    expect(dayLabel([tag("BRUNCH", "11:00", "12:30"), tag("WALK", "13:00", "16:00", { outdoor: true })], 29)).toBe(
      "Brunch, then a long walk",
    );
    expect(dayLabel([], 25)).toBe("Slow day");
  });

  it("covers short and untimed walks, untimed events and cold days", () => {
    expect(dayLabel([tag("BRUNCH", "11:00", "12:00"), tag("WALK", "13:00", "14:00")], null)).toBe("Brunch, then a walk");
    expect(dayLabel([tag("BRUNCH", "11:00", "12:00"), tag("WALK", null, null)], null)).toBe("Brunch, then a walk");
    expect(dayLabel([tag("MEETING", null, null)], 12.4)).toBe("Meeting · 12°");
    expect(dayLabel([], null)).toBe("Slow day");
  });
});

describe("day lines", () => {
  it("renders every template", () => {
    expect(DAY_LINES.SLOW_DAY({})).toBe("Nothing to think about.");
    expect(DAY_LINES.WFH_THEN_GYM({})).toBe("Calls on camera, then straight out the door.");
    expect(DAY_LINES.DESK_TO_DRINKS({})).toBe("Desk to drinks without going home.");
    expect(DAY_LINES.LONG_DAY({ hours: 9 })).toBe("Polished in the room, easy for nine hours.");
    expect(DAY_LINES.LONG_DAY({ hours: 14 })).toBe("Polished in the room, easy for 14 hours.");
    expect(DAY_LINES.FORGOTTEN({ month: "June" })).toBe("Out for the first time since June.");
    expect(DAY_LINES.HEAT_AND_BAG({})).toBe("Cool for the heat, and a bag for the day.");
    expect(DAY_LINES.HOT_BARE({ event: "lunch" })).toBe("Light and bare-shouldered for a hot lunch.");
    expect(DAY_LINES.HOT_LIGHT({ event: "brunch" })).toBe("Light enough for a hot brunch.");
    expect(DAY_LINES.FITS_DAY({ event: "dinner at 8" })).toBe("Right for dinner at 8.");
    expect(DAY_LINES.DAY_UNAVAILABLE({ day: "Monday" })).toBe("Nothing in the closet is free for Monday.");
    expect(DAY_LINES.FITS_DAY({})).toBe("Right for .");
  });

  it("takes the first day rule, and is empty when there is none", () => {
    const reasons: NoteReason[] = [{ rule: "PAIR_TONAL", params: { a: "grey" } }, { rule: "SLOW_DAY", params: {} }];
    expect(renderDayLine(reasons)).toBe("Nothing to think about.");
    expect(renderDayLine([{ rule: "PAIR_TONAL", params: { a: "grey" } }])).toBe("");
  });
});

describe("stylist notes", () => {
  it("renders the site's stylist notes", () => {
    expect(
      renderNote([
        { rule: "PAIR_SAME_WARMTH", params: { a: "sage", b: "tan" } },
        { rule: "EARRINGS_BARE_NECK", params: { earrings: "gold hoops" } },
      ]),
    ).toBe("Sage and tan, same warmth. Gold hoops because the neckline’s bare.");
    expect(
      renderNote([
        { rule: "HAIR_UP", params: { accessory: "claw clip" } },
        { rule: "PLAIN_CORE", params: { fabric: "black knit" } },
      ]),
    ).toBe("Hair goes up in the claw clip, so the neckline does the talking. Black knit, nothing fussy.");
    expect(
      renderNote([
        { rule: "NOTHING_AT_WAIST", params: {} },
        { rule: "FALLS_FROM_SHOULDER", params: { fabric: "cream linen", footwear: "wedges" } },
      ]),
    ).toBe("Nothing at the waist today. Cream linen falls from the shoulder, and the wedges keep it dressed.");
    expect(
      renderNote([
        { rule: "COVERS_LEGS", params: { length: "floor", material: "linen", top: "tee" } },
        { rule: "A_CHOICE", params: {} },
      ]),
    ).toBe("Floor-length linen and a crisp tee. It reads as a choice, not a cover-up.");
    expect(
      renderNote([
        { rule: "AFTER_SIX", params: { fabric: "black satin" } },
        { rule: "EVENING_FINISH", params: { earrings: "gold drops", bag: "clutch", footwear: "wedges", same: 1 } },
      ]),
    ).toBe("Black satin after six. Gold drops, the clutch, and the same wedges, so it’s dinner, not a gala.");
  });

  it("renders every other template and variant", () => {
    expect(NOTE_LINES.PAIR_NEUTRAL({ a: "navy", b: "white" })).toBe("Navy and white, an easy pair.");
    expect(NOTE_LINES.PAIR_TONAL({ a: "grey" })).toBe("Grey on grey, kept tonal.");
    expect(NOTE_LINES.PAIR_CONTRAST({ a: "red", b: "green" })).toBe("Red against green, one clear contrast.");
    expect(NOTE_LINES.EARRINGS_FINISH({ earrings: "gold drops" })).toBe("Gold drops to finish it.");
    expect(NOTE_LINES.HAIR_UP({})).toBe("Hair goes up, so the neckline does the talking.");
    expect(NOTE_LINES.FALLS_FROM_SHOULDER({ fabric: "linen" })).toBe("Linen falls from the shoulder.");
    expect(NOTE_LINES.EASY_AT_WAIST({ fabric: "cream linen", footwear: "wedges" })).toBe(
      "Cream linen sits easy at the waist, and the wedges keep it dressed.",
    );
    expect(NOTE_LINES.EASY_AT_WAIST({ fabric: "cream linen" })).toBe("Cream linen sits easy at the waist.");
    expect(NOTE_LINES.COVERS_LEGS({ length: "ankle", material: "denim", sleeves: 1 })).toBe("Ankle-length denim with sleeves.");
    expect(NOTE_LINES.COVERS_LEGS({ length: "trousers", material: "wool" })).toBe("Full-length wool.");
    expect(NOTE_LINES.COVERS_LEGS({ length: "unknown", material: "silk" })).toBe("Full-length silk.");
    expect(NOTE_LINES.COVERS_UPPER({ fabric: "black knit" })).toBe("Black knit with sleeves.");
    expect(NOTE_LINES.LIGHTER({ fabric: "white linen" })).toBe("White linen, lighter for the heat.");
    expect(NOTE_LINES.WARMER({ fabric: "black knit" })).toBe("Black knit, warmer for today.");
    expect(NOTE_LINES.WARMER({ fabric: "black knit", layer: "camel coat" })).toBe(
      "Black knit with the camel coat on top, warmer for today.",
    );
    expect(NOTE_LINES.RAIN_READY({ fabric: "navy nylon", footwear: "black boots" })).toBe(
      "Navy nylon, and black boots that can take the rain.",
    );
    expect(NOTE_LINES.RAIN_READY({ fabric: "navy nylon" })).toBe("Navy nylon, ready for the rain.");
    expect(NOTE_LINES.REPLANNED({ fabric: "black knit", plans: "work" })).toBe("Black knit, re-dressed for work.");
  });

  it("finishes an evening look from whatever it has", () => {
    const finish = NOTE_LINES.EVENING_FINISH;
    expect(finish({ footwear: "heels", same: 0 })).toBe("The heels.");
    expect(finish({ earrings: "gold drops", bag: "clutch" })).toBe("Gold drops and the clutch.");
    expect(finish({ bag: "clutch", footwear: "wedges", same: 1 })).toBe("The clutch and the same wedges, so it’s dinner, not a gala.");
    expect(finish({})).toBe("");
  });

  it("drops rules without a note and empty lines, then falls back to the day line", () => {
    expect(
      renderNote([
        { rule: "FITS_DAY", params: { event: "lunch at 1" } },
        { rule: "EVENING_FINISH", params: {} },
        { rule: "A_CHOICE", params: {} },
      ]),
    ).toBe("It reads as a choice, not a cover-up.");
    expect(renderNote([{ rule: "FITS_DAY", params: { event: "lunch at 1" } }])).toBe("Right for lunch at 1.");
    expect(renderNote([])).toBe("");
  });
});

describe("backup copy", () => {
  it("writes the site's whys", () => {
    expect(
      backupWhy({ check: "NOT_WAXED", day: "Monday", piece: "strapless mini", plural: false, zones: ["shoulders", "underarms", "legs"] }),
    ).toBe("Monday’s strapless mini shows shoulders, underarms and legs.");
    expect(
      backupWhy({ check: "BLOATED", piece: "sage mini", plural: false, fits: ["ruched", "tight"], areas: ["waist", "hips"] }),
    ).toBe("The sage mini is ruched and tight through the waist and hips.");
    expect(backupWhy({ check: "BAD_HAIR" })).toBe("The look was built around hair down and blow-dried.");
    expect(
      backupWhy({ check: "PARTY_DATE", colour: "sage", piece: "sage mini", bag: "straw bag", event: "lunch at 1", tempC: 31 }),
    ).toBe("Sage and a straw bag, planned for lunch at 1 in 31°.");
  });

  it("handles plurals, no bag, no colour, no event and no temperature", () => {
    expect(backupWhy({ check: "NOT_WAXED", day: "Saturday", piece: "shorts", plural: true, zones: ["legs"] })).toBe(
      "Saturday’s shorts show legs.",
    );
    expect(backupWhy({ check: "BLOATED", piece: "black jeans", plural: true, fits: ["tight"], areas: ["hips"] })).toBe(
      "The black jeans are tight through the hips.",
    );
    expect(backupWhy({ check: "PARTY_DATE", colour: null, piece: "mini", bag: "straw bag", event: null, tempC: null })).toBe(
      "Mini, planned for the day.",
    );
    expect(backupWhy({ check: "PARTY_DATE", colour: "red", piece: "red mini", bag: null, event: "lunch", tempC: 12 })).toBe(
      "Red mini, planned for lunch in 12°.",
    );
    expect(backupWhy({ check: "PARTY_DATE", colour: "sage", piece: "sage mini", bag: "embroidered pouch", event: null, tempC: null })).toBe(
      "Sage and an embroidered pouch, planned for the day.",
    );
  });

  it("says what the closet lacks", () => {
    expect(backupMissing("NOT_WAXED", ["legs"], "this week")).toBe("Nothing that covers the legs fits this week.");
    expect(backupMissing("NOT_WAXED", [], "today")).toBe("Nothing that covers the underarms and legs fits today.");
    expect(backupMissing("BLOATED", [], "this week")).toBe("Nothing loose through the waist and hips fits this week.");
    expect(backupMissing("BAD_HAIR", [], "today")).toBe("Nothing built for hair up fits today.");
    expect(backupMissing("PARTY_DATE", [], "this week")).toBe("Nothing evening-ready fits this week.");
  });

  it("names the checks as the site does, and has copy for every reason", () => {
    expect(CHECK_COPY.PARTY_DATE).toEqual({ title: "Party or date", checks: "Checks where you’re headed after" });
    expect(Object.keys(BACKUP_WHY_NONE)).toHaveLength(4);
    expect(Object.keys(RESTYLE_PASSES)).toHaveLength(5);
    expect(Object.keys(RESTYLE_NONE)).toHaveLength(8);
    expect(Object.keys(PLANS_PHRASE)).toHaveLength(7);
  });
});
