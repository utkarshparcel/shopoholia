#!/usr/bin/env node
/**
 * TRUST-DPDP-GDPR — CI hook (no fake counsel signature, no store submit).
 * Validates privacy draft + DPDP/GDPR checklist + in-app data dashboard links.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const privacy = join(root, "docs/legal/PRIVACY_POLICY_DRAFT.md");
const checklist = join(root, "docs/TRUST_DPDP_GDPR.md");
const privacyLib = join(root, "apps/mobile/src/lib/privacyLinks.ts");
const vaultUi = join(root, "apps/mobile/src/components/VaultPrivacyActions.tsx");
const gtm = join(root, "docs/GTM_ZERO_SPEND.md");

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

const pol = read(privacy);
const chk = read(checklist);
const lib = read(privacyLib);
const ui = read(vaultUi);
const gtmBody = read(gtm);

if (pol) {
  for (const { label, re } of [
    { label: "Privacy Policy title", re: /Privacy Policy/i },
    { label: "draft disclaimer", re: /[Dd]raft|not published|counsel/i },
    { label: "export / delete", re: /[Ee]xport|[Dd]elete/ },
    { label: "DPDP or GDPR", re: /DPDP|GDPR/ },
    { label: "Limited Use / Gmail", re: /Limited Use|Gmail|inbox/i },
    { label: "checklist pointer", re: /TRUST_DPDP_GDPR/ },
  ]) {
    if (!re.test(pol)) fail(`docs/legal/PRIVACY_POLICY_DRAFT.md missing: ${label}`);
  }
}

if (chk) {
  for (const { label, re } of [
    { label: "DPDP checklist", re: /DPDP/i },
    { label: "GDPR checklist", re: /GDPR/i },
    { label: "DPA / sub-processors", re: /DPA|[Ss]ub-processor/ },
    { label: "counsel sign-off section", re: /[Cc]ounsel sign-off|wet-ink|Do not invent counsel/i },
    { label: "in-app data dashboard", re: /data dashboard|VaultPrivacy|Your data/i },
    { label: "privacy draft link", re: /PRIVACY_POLICY_DRAFT/ },
    { label: "pentest readiness link", re: /PENTEST_READINESS/ },
  ]) {
    if (!re.test(chk)) fail(`docs/TRUST_DPDP_GDPR.md missing: ${label}`);
  }
  if (/Counsel signed:\s*yes/i.test(chk) || /☑\s*Counsel wet-ink/i.test(chk)) {
    fail("docs/TRUST_DPDP_GDPR.md must not fake counsel wet-ink as complete");
  }
}

if (lib) {
  for (const needle of [
    "getPrivacyPolicyUrl",
    "getDataDashboardLinks",
    "PRIVACY_POLICY_DRAFT_PATH",
    "EXPO_PUBLIC_PRIVACY_URL",
    "DPDP_GDPR_CHECKLIST_PATH",
  ]) {
    if (!lib.includes(needle)) fail(`privacyLinks.ts missing ${needle}`);
  }
}

if (ui) {
  if (!ui.includes("privacyLinks") && !ui.includes("getPrivacyPolicyUrl")) {
    fail("VaultPrivacyActions must import privacyLinks");
  }
  if (!/Privacy policy|getPrivacyPolicyUrl/i.test(ui)) {
    fail("VaultPrivacyActions must expose Privacy policy link");
  }
  if (!/Export my data/i.test(ui) || !/Delete my account/i.test(ui)) {
    fail("VaultPrivacyActions must keep export + delete");
  }
}

if (gtmBody && !/TRUST_DPDP_GDPR\.md|docs\/TRUST_DPDP_GDPR/i.test(gtmBody)) {
  fail("docs/GTM_ZERO_SPEND.md must link TRUST-DPDP checklist (docs/TRUST_DPDP_GDPR.md)");
}

if (errors.length) {
  console.error("TRUST-DPDP-GDPR check failed:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  "TRUST-DPDP-GDPR OK — privacy draft, checklist + DPAs, in-app data dashboard (no fake counsel signature).",
);
