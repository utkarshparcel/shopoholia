#!/usr/bin/env node
import { runAgentLoop } from "./agent.js";
import { createApiClient } from "./api.js";
import { AGENT_VERSION, loadConfig } from "./config.js";
import { createDryRunEngine, createMediagenEngine } from "./mediagen.js";

/** launchd reads a non-zero exit as a crash; EX_CONFIG says it is the setup, not the code. */
const EX_CONFIG = 78;

function log(message: string, fields: Record<string, unknown> = {}) {
  // Ids only: job ids and statuses, never URLs (they carry signatures) or image data.
  console.log(JSON.stringify({ at: new Date().toISOString(), message, ...fields }));
}

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    console.error(String(error instanceof Error ? error.message : error));
    process.exit(EX_CONFIG);
  }
  const engine = config.dryRun ? createDryRunEngine() : createMediagenEngine(config.mediagenUrl);
  if (!engine.configured) {
    console.error(
      "The mediagen adapter is a stub (src/mediagen.ts): fill it in, or run with --dry-run to test the loop. Not leasing any jobs.",
    );
    process.exit(EX_CONFIG);
  }
  const api = createApiClient({ apiUrl: config.apiUrl, token: config.token, agentId: config.agentId });
  const controller = new AbortController();
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => controller.abort());
  }
  log("render agent starting", {
    agentId: config.agentId,
    version: AGENT_VERSION,
    window: config.window.kind === "always" ? "always" : config.window,
    dryRun: config.dryRun,
  });
  await runAgentLoop({
    api,
    engine,
    workDir: config.workDir,
    window: config.window,
    timeZone: config.timeZone,
    version: AGENT_VERSION,
    pollMs: config.pollMs,
    heartbeatMs: config.heartbeatMs,
    maxJobs: config.maxJobs,
    log,
    signal: controller.signal,
  });
  log("render agent stopped");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
