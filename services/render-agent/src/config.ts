import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseWindow, type AgentWindow } from "./window.js";

export type AgentConfig = {
  apiUrl: string;
  token: string;
  agentId: string;
  mediagenUrl: string;
  window: AgentWindow;
  timeZone: string;
  /** Where each job's inputs live while it renders (deleted after every job). */
  workDir: string;
  pollMs: number;
  heartbeatMs: number;
  /** Jobs to lease at once; the Mac renders one at a time. */
  maxJobs: number;
  dryRun: boolean;
};

/** The macOS Keychain item that holds the agent token (see README). */
export const KEYCHAIN_SERVICE = "worn-render-agent";

export type ReadKeychain = (service: string) => string | null;

/** `security find-generic-password -w -s worn-render-agent`, on macOS only. */
export const readMacKeychain: ReadKeychain = (service) => {
  if (process.platform !== "darwin") return null;
  try {
    return execFileSync("security", ["find-generic-password", "-w", "-s", service], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
};

export const AGENT_VERSION = "0.1.0";

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
  options: { argv?: string[]; readKeychain?: ReadKeychain } = {},
): AgentConfig {
  const argv = options.argv ?? process.argv.slice(2);
  const apiUrl = env.WORN_API_URL?.trim().replace(/\/$/, "");
  if (!apiUrl) throw new Error("WORN_API_URL is not set (the API's https URL)");
  if (!/^https:\/\//.test(apiUrl) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(apiUrl)) {
    throw new Error("WORN_API_URL must be https (plain http only for localhost)");
  }
  const token = env.RENDER_AGENT_TOKEN?.trim() || (options.readKeychain ?? readMacKeychain)(KEYCHAIN_SERVICE);
  if (!token) {
    throw new Error(
      `RENDER_AGENT_TOKEN is not set and the Keychain has no "${KEYCHAIN_SERVICE}" item ` +
        `(security add-generic-password -a "$USER" -s ${KEYCHAIN_SERVICE} -w)`,
    );
  }
  const pollSeconds = Number(env.RENDER_AGENT_POLL_SECONDS ?? 30);
  return {
    apiUrl,
    token,
    agentId: env.AGENT_ID?.trim() || "mac-1",
    mediagenUrl: env.MEDIAGEN_URL?.trim() || "http://127.0.0.1:8199",
    window: parseWindow(env.RENDER_AGENT_WINDOW),
    timeZone: env.RENDER_AGENT_TIME_ZONE?.trim() || "Asia/Kolkata",
    workDir: env.RENDER_AGENT_WORK_DIR?.trim() || join(tmpdir(), "worn-render-agent"),
    pollMs: (Number.isFinite(pollSeconds) && pollSeconds > 0 ? pollSeconds : 30) * 1000,
    heartbeatMs: 60_000,
    maxJobs: 1,
    dryRun: argv.includes("--dry-run") || env.RENDER_AGENT_DRY_RUN === "1",
  };
}
