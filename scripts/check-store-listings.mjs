#!/usr/bin/env node
/**
 * REL-STORE-LISTINGS — CI hook (no App Store / Play submit).
 * Validates docs/STORE_LISTINGS.md coverage for listing copy, Data Safety,
 * screenshot plan, and closed-testing ≥12 checklist.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const storeDoc = join(root, "docs/STORE_LISTINGS.md");
const gtmDoc = join(root, "docs/GTM_ZERO_SPEND.md");

const errors = [];

function fail(msg) {
  errors.push(msg);
}

function read(path) {
  if (!existsSync(path)) {
    fail(`missing ${path}`);
    return "";
  }
  return readFileSync(path, "utf8");
}

const store = read(storeDoc);
const gtm = read(gtmDoc);

if (store) {
  const required = [
    { label: "Play listing copy", re: /Google Play|Play Store|title.*Gift Card/i },
    { label: "App Store listing copy", re: /App Store|subtitle|Keywords/i },
    { label: "Data Safety checklist", re: /Data Safety/i },
    { label: "App Privacy / nutrition", re: /nutrition|App Privacy|privacy label/i },
    { label: "screenshot #1 found-money", re: /Screenshot|#1|found-money|forgotten credit/i },
    { label: "closed testers ≥12", re: /≥\s*12|>=\s*12|closed tester/i },
    { label: "no store submit in CI", re: /no.*store submit|does \*\*not\*\* submit|never.*submit/i },
    { label: "bundle id", re: /com\.shopoholia\.worn/ },
  ];
  for (const { label, re } of required) {
    if (!re.test(store)) fail(`docs/STORE_LISTINGS.md missing coverage: ${label}`);
  }
}

if (gtm && !/STORE_LISTINGS|store listing/i.test(gtm)) {
  // Soft: GTM may already discuss listings; prefer an explicit link when present.
  // Only fail if GTM loses all store-listing discussion.
  if (!/Play Data Safety|screenshot #1|ASO/i.test(gtm)) {
    fail("docs/GTM_ZERO_SPEND.md missing store / ASO / Data Safety pointers");
  }
}

if (errors.length) {
  console.error("REL-STORE-LISTINGS check failed:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  "REL-STORE-LISTINGS OK — listing copy, Data Safety, screenshot plan, ≥12 closed-testing checklist (no store submit).",
);
