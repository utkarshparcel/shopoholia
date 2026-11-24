import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const servicesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * DEPLOY.md starts the Closet workers with `pnpm --filter <name> start`. src/index.ts only exports
 * factories; the process entry that creates the BullMQ consumer is src/main.ts. So every worker
 * with a main.ts must start dist/main.js, or `start` runs a library and consumes nothing.
 */
describe("worker start scripts", () => {
  const workers = readdirSync(servicesDir).filter(
    (name) => name.startsWith("worker-") && existsSync(join(servicesDir, name, "src", "main.ts")),
  );

  it("finds the Closet workers", () => {
    expect(workers).toEqual(
      expect.arrayContaining(["worker-expiry", "worker-gifts", "worker-ingest", "worker-returns", "worker-wardrobe"]),
    );
  });

  it.each(workers)("%s starts its process entry", (name) => {
    const pkg = JSON.parse(readFileSync(join(servicesDir, name, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.start).toBe("node dist/main.js");
  });
});
