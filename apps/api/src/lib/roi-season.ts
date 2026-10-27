/**
 * Wardrobe ROI by India closet season (Summer / Monsoon / Winter).
 * Aggregates wear_log × wardrobe cost — what earned wears vs sat idle.
 *
 * Season windows for calendar year Y:
 *   SUMMER  Mar 1 Y – May 31 Y
 *   MONSOON Jun 1 Y – Sep 30 Y
 *   WINTER  Oct 1 Y – last day of Feb Y+1
 */

export type ClosetSeason = "SUMMER" | "MONSOON" | "WINTER";

export const CLOSET_SEASONS: readonly ClosetSeason[] = ["SUMMER", "MONSOON", "WINTER"];

export type SeasonWindow = {
  season: ClosetSeason;
  year: number;
  start: Date;
  end: Date;
  label: string;
};

export type SeasonRoiRow = {
  season: ClosetSeason;
  label: string;
  start: string;
  end: string;
  /** Wear events in this season. */
  wears: number;
  /** Distinct items worn at least once. */
  itemsWorn: number;
  /** Cost of items that earned ≥1 wear. */
  costWornMinor: number;
  /** Cost of owned items with 0 wears in the season (sat idle / "dead"). */
  costIdleMinor: number;
  /** Items owned during the season with 0 wears. */
  itemsIdle: number;
  /** costWornMinor / wears, or null when no wears. */
  costPerWearMinor: number | null;
};

export type SeasonRoiReport = {
  year: number;
  seasons: SeasonRoiRow[];
  /** Sum of wears across seasons. */
  totalWears: number;
  /** Sum of costWornMinor across seasons (item may count in multiple seasons). */
  totalCostWornMinor: number;
  /** Sum of costIdleMinor across seasons. */
  totalCostIdleMinor: number;
};

export type SeasonRoiItem = {
  id: string;
  costMinor: number;
  createdAt: Date;
};

export type SeasonRoiWear = {
  wardrobeItemId: string | null;
  wornOn: Date;
};

function utcDate(y: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(y, monthIndex, day, 0, 0, 0, 0));
}

function lastDayOfFeb(year: number): number {
  return new Date(Date.UTC(year, 2, 0)).getUTCDate();
}

/** Map a UTC date into an India closet season. */
export function seasonForDate(d: Date): ClosetSeason {
  const m = d.getUTCMonth(); // 0–11
  if (m >= 2 && m <= 4) return "SUMMER";
  if (m >= 5 && m <= 8) return "MONSOON";
  return "WINTER";
}

export function seasonWindow(year: number, season: ClosetSeason): SeasonWindow {
  if (season === "SUMMER") {
    return {
      season,
      year,
      start: utcDate(year, 2, 1),
      end: utcDate(year, 5, 0), // May 31
      label: `Summer ${year}`,
    };
  }
  if (season === "MONSOON") {
    return {
      season,
      year,
      start: utcDate(year, 5, 1),
      end: utcDate(year, 9, 0), // Sep 30
      label: `Monsoon ${year}`,
    };
  }
  return {
    season,
    year,
    start: utcDate(year, 9, 1),
    end: utcDate(year + 1, 1, lastDayOfFeb(year + 1)),
    label: `Winter ${year}`,
  };
}

function inWindow(d: Date, start: Date, end: Date): boolean {
  const t = d.getTime();
  return t >= start.getTime() && t <= end.getTime() + 86_400_000 - 1;
}

/**
 * Aggregate wears vs cost per season for a closet year.
 * An item is "owned" in a season if createdAt ≤ season end.
 * Idle = owned + zero wears in the window.
 */
export function aggregateSeasonRoi(input: {
  year: number;
  items: SeasonRoiItem[];
  wearLogs: SeasonRoiWear[];
}): SeasonRoiReport {
  const { year, items, wearLogs } = input;
  const byId = new Map(items.map((i) => [i.id, i]));

  const seasons: SeasonRoiRow[] = CLOSET_SEASONS.map((season) => {
    const w = seasonWindow(year, season);
    const wearsInSeason = wearLogs.filter(
      (log) => log.wardrobeItemId && inWindow(log.wornOn, w.start, w.end),
    );
    const wornIds = new Set(
      wearsInSeason.map((log) => log.wardrobeItemId!).filter((id) => byId.has(id)),
    );
    const owned = items.filter((i) => i.createdAt.getTime() <= w.end.getTime());
    const idleIds = owned.filter((i) => !wornIds.has(i.id));

    let costWornMinor = 0;
    for (const id of wornIds) {
      costWornMinor += Math.max(0, byId.get(id)?.costMinor ?? 0);
    }
    let costIdleMinor = 0;
    for (const i of idleIds) {
      costIdleMinor += Math.max(0, i.costMinor);
    }

    const wears = wearsInSeason.length;
    return {
      season,
      label: w.label,
      start: w.start.toISOString(),
      end: w.end.toISOString(),
      wears,
      itemsWorn: wornIds.size,
      costWornMinor,
      costIdleMinor,
      itemsIdle: idleIds.length,
      costPerWearMinor: wears > 0 ? Math.round(costWornMinor / wears) : null,
    };
  });

  return {
    year,
    seasons,
    totalWears: seasons.reduce((s, r) => s + r.wears, 0),
    totalCostWornMinor: seasons.reduce((s, r) => s + r.costWornMinor, 0),
    totalCostIdleMinor: seasons.reduce((s, r) => s + r.costIdleMinor, 0),
  };
}
