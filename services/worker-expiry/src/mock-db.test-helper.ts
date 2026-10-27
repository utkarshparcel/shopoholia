import { pushEvents, users, type Db } from "@worn/db";

export type MockUser = {
  prefs?: Record<string, unknown>;
  timeZone?: string;
  pushToken?: string | null;
} | null;

/**
 * A Db stand-in for the handlers: a select returns the rows given for its table, and push_events
 * keeps one row per dedupe key (like the unique index), so running a job twice can be tested.
 */
export function mockDb(
  user: MockUser | undefined,
  tables: Array<[unknown, Array<Record<string, unknown>>]> = [],
) {
  const inserted: Array<Record<string, unknown>> = [];
  const updated: Array<Record<string, unknown>> = [];
  const rows = new Map<unknown, Array<Record<string, unknown>>>(tables);
  rows.set(
    users,
    user === null
      ? []
      : [{ prefs: user?.prefs ?? {}, timeZone: user?.timeZone ?? "Asia/Kolkata", pushToken: user?.pushToken ?? null }],
  );
  const pushRows = new Map<string, { id: string; status: string }>();
  let lastKey = "";

  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: () =>
            Promise.resolve(
              table === pushEvents ? (pushRows.has(lastKey) ? [pushRows.get(lastKey)] : []) : (rows.get(table) ?? []),
            ),
        }),
      }),
    }),
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        onConflictDoNothing: () => ({
          returning: () => {
            lastKey = String(v.dedupeKey);
            if (pushRows.has(lastKey)) return Promise.resolve([]);
            inserted.push(v);
            const row = { id: `pe-${pushRows.size + 1}`, status: "QUEUED" };
            pushRows.set(lastKey, row);
            return Promise.resolve([row]);
          },
        }),
      }),
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => ({
        where: () => {
          updated.push(v);
          const row = pushRows.get(lastKey);
          if (row && typeof v.status === "string") row.status = v.status;
          return Promise.resolve();
        },
      }),
    }),
    inserted,
    updated,
  };
  return db as unknown as Db & {
    inserted: Array<Record<string, unknown>>;
    updated: Array<Record<string, unknown>>;
  };
}
