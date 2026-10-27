import type { DeadLetter } from "@worn/shared";
import type { FastifyBaseLogger } from "fastify";
import type { Repositories } from "../lib/repositories/types.js";
import type { StorageClient } from "../lib/storage/r2.js";

/** The second argument of every job handler (C6: a handler is `async (data, deps) => void`). */
export type JobDeps = {
  repos: Repositories;
  storage: StorageClient;
  log: FastifyBaseLogger;
  /** Writes a row to job_dead_letters (Postgres). */
  recordDeadLetter: (entry: DeadLetter) => Promise<void>;
  now: () => Date;
};
