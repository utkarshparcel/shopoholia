#!/usr/bin/env node
/**
 * TRUST-CASA-TRACK — CI hook (no Google verification submit, no store submit).
 * Validates CASA/Limited Use docs + in-app disclosure module + Wave 1 Gmail-optional paths.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const casaDoc = join(root, "docs/CASA.md");
const gtmDoc = join(root, "docs/GTM_ZERO_SPEND.md");
const limitedUse = join(root, "apps/mobile/src/lib/limitedUse.ts");
const connectEmail = join(root, "apps/mobile/app/(closet)/connect-email.tsx");
const consent = join(root, "apps/mobile/app/(closet)/consent.tsx");
const onboarding = join(root, "apps/mobile/app/(closet)/onboarding.tsx");

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

const casa = read(casaDoc);
const gtm = read(gtmDoc);
const lu = read(limitedUse);
const connect = read(connectEmail);
const consentSrc = read(consent);
const onboard = read(onboarding);

if (casa) {
  const required = [
    { label: "verification packet / checklist", re: /verification packet|checklist/i },
    { label: "demo video English", re: /demo video.*english|english.*demo video/i },
    { label: "Limited Use", re: /Limited Use/i },
    { label: "gmail.readonly", re: /gmail\.readonly/i },
    { label: "Wave 1 / Gmail-optional", re: /Wave 1|Gmail.?optional|without.*Gmail/i },
    { label: "no store / Google submit in CI", re: /does \*\*not\*\*|never.*submit|no Google submit|no store submit/i },
    { label: "CASA annual note", re: /CASA/i },
  ];
  for (const { label, re } of required) {
    if (!re.test(casa)) fail(`docs/CASA.md missing coverage: ${label}`);
  }
}

if (gtm) {
  if (!/Limited Use/i.test(gtm)) fail("docs/GTM_ZERO_SPEND.md missing Limited Use");
  if (!/CASA\.md|docs\/CASA/i.test(gtm)) {
    fail("docs/GTM_ZERO_SPEND.md must link TRUST-CASA checklist (docs/CASA.md)");
  }
  if (!/100.?user|test cap/i.test(gtm)) {
    fail("docs/GTM_ZERO_SPEND.md missing 100-user / test cap guidance");
  }
}

if (lu) {
  for (const needle of [
    "LIMITED_USE_BULLETS",
    "getLimitedUseDisclosure",
    "gmail.readonly",
    "OAUTH_CONSENT_LONG_DESCRIPTION_EN",
  ]) {
    if (!lu.includes(needle)) fail(`limitedUse.ts missing ${needle}`);
  }
}

if (connect && !connect.includes("limitedUse") && !connect.includes("LIMITED_USE") && !connect.includes("getLimitedUseDisclosure")) {
  fail("connect-email.tsx must import/show Limited Use disclosures from limitedUse");
}
if (consentSrc && !consentSrc.includes("limitedUse") && !consentSrc.includes("getLimitedUseDisclosure") && !consentSrc.includes("LIMITED_USE")) {
  fail("consent.tsx must import/show Limited Use disclosures from limitedUse");
}

// Wave 1 must stay Gmail-optional: onboarding keeps demo/manual without requiring OAuth.
if (onboard) {
  if (!/demo:\s*true|SAMPLE_MYNTRA|landVault\(['\"]demo['\"]\)|landVault\(['\"]manual['\"]\)/.test(onboard)) {
    fail("onboarding.tsx must keep demo/manual found-money path (no CASA dependency)");
  }
  if (!/Skip for now|skip/i.test(onboard)) {
    fail("onboarding.tsx must allow skipping Gmail connect");
  }
}

if (errors.length) {
  console.error("TRUST-CASA-TRACK check failed:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  "TRUST-CASA-TRACK OK — CASA packet docs, Limited Use in-app module, GTM link, Wave 1 Gmail-optional (no Google/store submit).",
);
