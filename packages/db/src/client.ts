import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";

export function createDb(connectionString: string) {
  const client = postgres(connectionString, {
    max: 20,
    // Seconds: close idle connections, give up on a connect, recycle long-lived ones.
    idle_timeout: 30,
    connect_timeout: 10,
    max_lifetime: 30 * 60,
    // Milliseconds, set per session: a runaway query or a transaction left open
    // can't hold a pooled connection (and its locks) indefinitely.
    connection: {
      statement_timeout: 10_000,
      idle_in_transaction_session_timeout: 15_000,
    },
  });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;
