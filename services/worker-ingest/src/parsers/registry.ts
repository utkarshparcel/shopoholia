import type {
  MerchantParser,
  MetricsSink,
  ParsedResult,
  RawEmailMessage,
} from "./types.js";

/** Pluggable parser registry. Tries dedicated merchant parsers first, then
 * falls back to the generic heuristic parser, emitting a coverage event for
 * every message it sees. */
export class ParserRegistry {
  private readonly generic: MerchantParser | undefined;

  constructor(
    private readonly parsers: MerchantParser[],
    private readonly metrics: MetricsSink,
  ) {
    this.generic = parsers.find((p) => p.id === "generic");
  }

  /** Parser ids currently registered, in evaluation order. */
  list(): string[] {
    return this.parsers.map((p) => p.id);
  }

  parse(msg: RawEmailMessage): ParsedResult {
    for (const parser of this.parsers) {
      if (parser.id === "generic") continue;
      if (parser.canParse(msg)) {
        const purchase = parser.parse(msg);
        this.emit(msg, parser.id, purchase.merchant, true);
        return { matched: true, parserId: parser.id, purchase };
      }
    }

    if (this.generic && this.generic.canParse(msg)) {
      const purchase = this.generic.parse(msg);
      this.emit(msg, "generic", purchase.merchant, false);
      return { matched: true, parserId: "generic", purchase };
    }

    this.metrics.record({
      messageId: msg.messageId,
      parserId: null,
      matched: false,
      merchant: null,
      specific: false,
    });
    return { matched: false };
  }

  private emit(
    msg: RawEmailMessage,
    parserId: string,
    merchant: string,
    specific: boolean,
  ): void {
    this.metrics.record({
      messageId: msg.messageId,
      parserId,
      matched: true,
      merchant,
      specific,
    });
  }
}
