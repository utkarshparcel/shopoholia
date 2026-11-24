import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { isEntryPoint } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("API entry point", () => {
  it("starts the server only when index is the script being run", () => {
    const index = join(here, "index.ts");
    expect(isEntryPoint(pathToFileURL(index).href, index)).toBe(true);
    // Imported by a script, a test or another module: no second server, no second set of timers.
    expect(isEntryPoint(pathToFileURL(index).href, join(here, "worker.ts"))).toBe(false);
    expect(isEntryPoint(pathToFileURL(index).href, undefined)).toBe(false);
  });

  it("keeps test and dev helpers out of the production build", () => {
    const tsconfig = JSON.parse(readFileSync(join(here, "../tsconfig.json"), "utf8")) as { exclude: string[] };
    expect(tsconfig.exclude).toEqual(
      expect.arrayContaining(["src/**/*.test.ts", "src/test-utils.ts", "src/lib/iap/test-support.ts"]),
    );
  });
});
