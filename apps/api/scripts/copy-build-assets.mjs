#!/usr/bin/env node
// Copies the non-TypeScript files the API reads at runtime from src/ into dist/ (tsc copies none).
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
/** Paths relative to src/ (and to dist/). */
const ASSETS = ["lib/seed/scraped-catalog.jsonl"];

for (const asset of ASSETS) {
  const target = join(root, "dist", asset);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(join(root, "src", asset), target);
}
