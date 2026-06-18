#!/usr/bin/env tsx
/**
 * FASHN try-on spike — local model + garment images → result on disk.
 *
 * Usage:
 *   FASHN_API_KEY=... pnpm --filter @worn/api render-spike ./model.jpg ./garment.jpg
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import {
  createFashnClient,
  creditsToMicros,
  FASHN_CREDIT_MICROS,
} from "../src/lib/render/fashn-client.js";

function usage(): never {
  console.error("Usage: render-spike <model-image> <garment-image> [output-dir]");
  process.exit(1);
}

function mimeForPath(path: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

async function toDataUri(path: string): Promise<string> {
  const buffer = await readFile(path);
  return `data:${mimeForPath(path)};base64,${buffer.toString("base64")}`;
}

async function main() {
  const modelPath = process.argv[2];
  const garmentPath = process.argv[3];
  const outputDir = process.argv[4] ?? "tmp/render-spike";

  if (!modelPath || !garmentPath) usage();

  const apiKey = process.env.FASHN_API_KEY;
  if (!apiKey) {
    console.error("FASHN_API_KEY is not set. Add it to .env or export it for live try-on.");
    console.error("Without a key, the API uses mock-fashn (deterministic keys, no HTTP).");
    process.exit(1);
  }

  console.log("FASHN render spike (tryon-max, 2k balanced)");
  console.log(`  model:   ${modelPath}`);
  console.log(`  garment: ${garmentPath}`);

  const [modelImage, productImage] = await Promise.all([
    toDataUri(modelPath),
    toDataUri(garmentPath),
  ]);

  const client = createFashnClient({ apiKey });
  const startedAt = Date.now();
  const result = await client.tryOnMax({ modelImage, productImage });
  const elapsedMs = Date.now() - startedAt;

  const imageResponse = await fetch(result.outputUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to download result (${imageResponse.status})`);
  }
  const imageBytes = Buffer.from(await imageResponse.arrayBuffer());

  await mkdir(outputDir, { recursive: true });
  const stem = `${basename(modelPath, extname(modelPath))}__${basename(garmentPath, extname(garmentPath))}`;
  const outputPath = join(outputDir, `${stem}-${result.predictionId}.jpg`);
  await writeFile(outputPath, imageBytes);

  const costMicros = creditsToMicros(result.creditsUsed);

  console.log("");
  console.log("Result");
  console.log(`  prediction:  ${result.predictionId}`);
  console.log(`  output url:  ${result.outputUrl}`);
  console.log(`  saved to:    ${outputPath}`);
  console.log(`  duration:    ${(elapsedMs / 1000).toFixed(1)}s (client ${(result.durationMs / 1000).toFixed(1)}s)`);
  console.log(`  credits:     ${result.creditsUsed}`);
  console.log(`  cost_micros: ${costMicros} (${FASHN_CREDIT_MICROS} micros/credit)`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
