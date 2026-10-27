import type { CoverageEvent, MetricsSink } from "./types.js";

/** Collects coverage events in memory — used by tests and the accuracy spike. */
export class InMemoryMetricsSink implements MetricsSink {
  readonly events: CoverageEvent[] = [];

  record(event: CoverageEvent): void {
    this.events.push(event);
  }

  /** Messages matched by a dedicated merchant parser (hits). */
  specificHits(): number {
    return this.events.filter((e) => e.specific).length;
  }

  /** Messages not matched at all (true misses). */
  totalMisses(): number {
    return this.events.filter((e) => !e.matched).length;
  }
}

/** Logs each coverage event to stdout — the default sink for the live worker. */
export class ConsoleMetricsSink implements MetricsSink {
  record(event: CoverageEvent): void {
    console.info(
      `[coverage] ${event.matched ? "hit" : "miss"} parser=${event.parserId ?? "none"} merchant=${event.merchant ?? "-"} msg=${event.messageId}`,
    );
  }
}
