import { describe, expect, it } from "vitest";
import { mapLimit } from "./concurrency.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("mapLimit", () => {
  it("keeps input order when calls finish out of order", async () => {
    const out = await mapLimit([30, 5, 20, 1, 10], 2, async (ms, i) => {
      await sleep(ms);
      return `${i}:${ms}`;
    });
    expect(out).toEqual(["0:30", "1:5", "2:20", "3:1", "4:10"]);
  });

  it("never runs more than `limit` calls at once", async () => {
    let inFlight = 0;
    let peak = 0;
    await mapLimit(Array.from({ length: 25 }, (_, i) => i), 3, async (i) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await sleep(i % 4);
      inFlight--;
      return i;
    });
    expect(peak).toBe(3);
  });

  it("returns [] for no items and handles a limit above the item count", async () => {
    expect(await mapLimit([], 4, async () => 1)).toEqual([]);
    expect(await mapLimit([1, 2], 10, async (n) => n * 2)).toEqual([2, 4]);
  });

  it("rejects with the first error only after in-flight calls settle, and starts no new ones", async () => {
    const started: number[] = [];
    const settled: number[] = [];
    const run = mapLimit([0, 1, 2, 3, 4, 5], 2, async (i) => {
      started.push(i);
      if (i === 0) {
        await sleep(5);
        settled.push(i);
        throw new Error("first");
      }
      if (i === 1) {
        await sleep(25);
        settled.push(i);
        throw new Error("second");
      }
      await sleep(1);
      settled.push(i);
      return i;
    });
    await expect(run).rejects.toThrow("first");
    // 1 was in flight when 0 failed: it finished before the rejection, and nothing new started.
    expect(settled).toContain(1);
    expect(started).toEqual([0, 1]);
  });

  it("rejects a bad limit", async () => {
    await expect(mapLimit([1], 0, async (n) => n)).rejects.toThrow(RangeError);
    await expect(mapLimit([1], 1.5, async (n) => n)).rejects.toThrow(RangeError);
  });
});
