import { describe, expect, it } from "vitest";
import * as schema from "@worn/db";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import {
  ANONYMISED_ON_ERASURE,
  ERASED_EXPLICITLY,
  EXEMPT_TABLES,
  KEPT_ON_ERASURE,
  SECONDARY_USER_COLUMNS,
  USER_DATA_TABLES,
} from "./user-data-tables.js";

const tables = Object.values(schema).filter((v): v is PgTable => is(v, PgTable));
const configs = tables.map((t) => getTableConfig(t));
const nameOf = (t: PgTable) => getTableConfig(t).name;

/** Every FK in the schema that points at users.id, as "table.column" → onDelete. */
function userForeignKeys(): Map<string, string> {
  const out = new Map<string, string>();
  for (const cfg of configs) {
    for (const fk of cfg.foreignKeys) {
      const ref = fk.reference();
      if (getTableConfig(ref.foreignTable).name !== "users") continue;
      for (const col of ref.columns) out.set(`${cfg.name}.${col.name}`, fk.onDelete ?? "no action");
    }
  }
  return out;
}

describe("user data table registry (export + erasure coverage)", () => {
  it("lists every schema table as user data or exempt", () => {
    const listed = new Set(USER_DATA_TABLES.map((s) => nameOf(s.table)));
    const missing = configs
      .map((c) => c.name)
      .filter((name) => !listed.has(name) && !(name in EXEMPT_TABLES));
    expect(missing).toEqual([]);
    // No stale entries.
    const known = new Set(configs.map((c) => c.name));
    expect([...listed, ...Object.keys(EXEMPT_TABLES)].filter((n) => !known.has(n))).toEqual([]);
  });

  it("every column that points at a user is an owner column or a documented secondary column", () => {
    const owners = new Set(
      USER_DATA_TABLES.flatMap((s) => ("owner" in s ? [`${nameOf(s.table)}.${s.owner.name}`] : [])),
    );
    const userColumns = new Set(userForeignKeys().keys());
    // Columns named like a user id without an FK (append-only tables keep no FK).
    for (const cfg of configs) {
      for (const col of cfg.columns) {
        if (/(^|_)user_id$/.test(col.name)) userColumns.add(`${cfg.name}.${col.name}`);
      }
    }
    const undocumented = [...userColumns].filter(
      (c) => !owners.has(c) && !(c in SECONDARY_USER_COLUMNS) && !(c.split(".")[0]! in EXEMPT_TABLES),
    );
    expect(undocumented).toEqual([]);
  });

  it("exempt tables still go with the user", () => {
    const fks = userForeignKeys();
    const kept = [...fks].filter(([col, rule]) => col.split(".")[0]! in EXEMPT_TABLES && rule !== "cascade");
    expect(kept).toEqual([]);
  });

  it("anonymised columns exist", () => {
    const byName = new Map(configs.map((c) => [c.name, new Set(c.columns.map((col) => col.name))]));
    const missing = Object.entries(ANONYMISED_ON_ERASURE).flatMap(([t, cols]) =>
      cols.filter((c) => !byName.get(t)?.has(c)).map((c) => `${t}.${c}`),
    );
    expect(missing).toEqual([]);
  });

  it("erasure reaches every owned row: cascade, explicit delete, or kept with the user nulled", () => {
    const fks = userForeignKeys();
    const problems: string[] = [];
    for (const spec of USER_DATA_TABLES) {
      if (!("owner" in spec)) continue;
      const table = nameOf(spec.table);
      if (table === "users") continue;
      const rule = fks.get(`${table}.${spec.owner.name}`);
      if (KEPT_ON_ERASURE.has(table) || table in ANONYMISED_ON_ERASURE) {
        if (rule !== undefined && rule !== "set null") problems.push(`${table}: kept rows need SET NULL, got ${rule}`);
      } else if (!ERASED_EXPLICITLY.has(table) && rule !== "cascade") {
        problems.push(`${table}: owner FK is ${rule ?? "missing"}; cascade it or delete it explicitly`);
      }
    }
    for (const col of Object.keys(SECONDARY_USER_COLUMNS)) {
      const rule = fks.get(col);
      if (rule !== undefined && rule !== "set null" && rule !== "cascade") {
        problems.push(`${col}: a pointer at a user must clear on erasure, got ${rule}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("child tables hang off a listed parent through a real foreign key", () => {
    const listed = new Set(USER_DATA_TABLES.map((s) => nameOf(s.table)));
    const problems: string[] = [];
    for (const spec of USER_DATA_TABLES) {
      if (!("parent" in spec)) continue;
      const child = getTableConfig(spec.table);
      const parentName = nameOf(spec.parent);
      if (!listed.has(parentName)) problems.push(`${child.name}: parent ${parentName} is not listed`);
      const fk = child.foreignKeys.find((f) => {
        const ref = f.reference();
        return ref.columns.some((c) => c.name === spec.fk.name) && getTableConfig(ref.foreignTable).name === parentName;
      });
      if (!fk) problems.push(`${child.name}.${spec.fk.name}: no FK to ${parentName}`);
    }
    expect(problems).toEqual([]);
  });

  it("omitted columns exist", () => {
    const problems: string[] = [];
    for (const spec of USER_DATA_TABLES) {
      const cols = new Set(Object.keys(getTableConfig(spec.table).columns.reduce((acc, c) => ({ ...acc, [c.name]: 1 }), {})));
      const keys = new Set(Object.keys(spec.table as unknown as Record<string, unknown>));
      for (const name of spec.omit ?? []) {
        if (!keys.has(name) && !cols.has(name)) problems.push(`${nameOf(spec.table)}.${name}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
