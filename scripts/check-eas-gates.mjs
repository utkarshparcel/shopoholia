#!/usr/bin/env node
/**
 * REL-EAS-GATES — CI hook (no store submit).
 * Validates eas.json profiles/channels + docs/EAS.md release checklist coverage.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const easPath = join(root, "apps/mobile/eas.json");
const docsPath = join(root, "docs/EAS.md");
const appJsonPath = join(root, "apps/mobile/app.json");

const errors = [];

function fail(msg) {
  errors.push(msg);
}

if (!existsSync(easPath)) fail(`missing ${easPath}`);
if (!existsSync(docsPath)) fail(`missing ${docsPath}`);

let eas;
try {
  eas = JSON.parse(readFileSync(easPath, "utf8"));
} catch (e) {
  fail(`eas.json parse error: ${e.message}`);
}

if (eas) {
  const build = eas.build ?? {};
  for (const profile of ["development", "preview", "production"]) {
    if (!build[profile]) fail(`eas.json missing build profile: ${profile}`);
  }
  if (build.preview?.distribution !== "internal") {
    fail('preview.distribution must be "internal"');
  }
  if (build.production?.distribution !== "store") {
    fail('production.distribution must be "store"');
  }
  for (const [name, channel] of [
    ["preview", "preview"],
    ["production", "production"],
  ]) {
    if (build[name]?.channel !== channel) {
      fail(`${name}.channel must be "${channel}" (got ${build[name]?.channel})`);
    }
  }
  if (!build.preview?.channel || !build.production?.channel) {
    fail("preview and production must set OTA channel");
  }
  // Never require submit credentials in CI — submit block is optional documentation only.
  if (eas.submit?.testflight && !eas.submit.testflight.ios) {
    fail("submit.testflight should define ios when present");
  }
}

const docs = existsSync(docsPath) ? readFileSync(docsPath, "utf8") : "";
const requiredDocSnippets = [
  { label: "preview build", re: /preview/i },
  { label: "OTA / eas update", re: /OTA|eas update/i },
  { label: "staged rollout", re: /staged rollout|rollout/i },
  { label: "crash-free ≥99.5%", re: /crash-free|99\.5%/i },
  { label: "no CI store submit", re: /no.*store submit|CI does not.*submit|never.*submit.*CI/i },
];
for (const { label, re } of requiredDocSnippets) {
  if (!re.test(docs)) fail(`docs/EAS.md missing coverage: ${label}`);
}

if (existsSync(appJsonPath)) {
  try {
    const app = JSON.parse(readFileSync(appJsonPath, "utf8"));
    const runtime = app.expo?.runtimeVersion;
    if (!runtime) {
      fail("apps/mobile/app.json missing expo.runtimeVersion (required for EAS Update OTA)");
    }
  } catch (e) {
    fail(`app.json parse error: ${e.message}`);
  }
}

if (errors.length) {
  console.error("REL-EAS-GATES check failed:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log("REL-EAS-GATES OK — eas profiles, OTA channels, docs checklist, runtimeVersion present (no store submit).");
