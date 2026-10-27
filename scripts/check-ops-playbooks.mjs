#!/usr/bin/env node
/**
 * OPS-PLAYBOOKS — CI hook.
 * Ensures the three ops playbooks exist and are discoverable from admin route source.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const playbooksDir = join(root, "docs/playbooks");
const adminRoute = join(root, "apps/api/src/routes/admin.ts");
const opsModule = join(root, "apps/api/src/lib/ops-playbooks.ts");

const requiredFiles = [
  "README.md",
  "parser-breakage.md",
  "refund-disputes.md",
  "data-deletion.md",
];

const errors = [];

function fail(msg) {
  errors.push(msg);
}

for (const name of requiredFiles) {
  const p = join(playbooksDir, name);
  if (!existsSync(p)) fail(`missing ${p}`);
}

const ids = ["parser-breakage", "refund-disputes", "data-deletion"];

const admin = existsSync(adminRoute) ? readFileSync(adminRoute, "utf8") : "";
if (!admin) fail(`missing ${adminRoute}`);
else if (!admin.includes("/admin/ops/playbooks")) {
  fail("admin.ts must expose GET /admin/ops/playbooks");
}

const ops = existsSync(opsModule) ? readFileSync(opsModule, "utf8") : "";
if (!ops) fail(`missing ${opsModule}`);
else {
  for (const id of ids) {
    if (!ops.includes(id)) fail(`ops-playbooks.ts missing id ${id}`);
  }
  if (!ops.includes("docs/playbooks/")) {
    fail("ops-playbooks.ts must reference docs/playbooks/ paths");
  }
}

for (const id of ids) {
  const body = readFileSync(join(playbooksDir, `${id}.md`), "utf8");
  if (!/^# Playbook:/m.test(body) && !/^# /m.test(body)) {
    fail(`${id}.md missing title heading`);
  }
  if (!/SLA/i.test(body)) fail(`${id}.md missing SLA guidance`);
}

if (errors.length) {
  console.error("OPS-PLAYBOOKS check failed:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log("OPS-PLAYBOOKS OK — three playbooks on disk + linked from admin /admin/ops/playbooks.");
