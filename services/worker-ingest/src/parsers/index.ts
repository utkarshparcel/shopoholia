import { ParserRegistry } from "./registry.js";
import { GenericHeuristicParser } from "./generic.js";
import { AmazonParser } from "./merchants/amazon.js";
import { FlipkartParser } from "./merchants/flipkart.js";
import { MyntraParser } from "./merchants/myntra.js";
import { SwiggyParser } from "./merchants/swiggy.js";
import { ZomatoParser } from "./merchants/zomato.js";
import type { MerchantParser, MetricsSink } from "./types.js";

export function defaultParsers(): MerchantParser[] {
  return [
    new AmazonParser(),
    new FlipkartParser(),
    new MyntraParser(),
    new SwiggyParser(),
    new ZomatoParser(),
    new GenericHeuristicParser(),
  ];
}

export function createDefaultRegistry(metrics: MetricsSink): ParserRegistry {
  return new ParserRegistry(defaultParsers(), metrics);
}

export { ParserRegistry } from "./registry.js";
export { GenericHeuristicParser } from "./generic.js";
export { BaseMerchantParser } from "./merchants/base.js";
export { AmazonParser } from "./merchants/amazon.js";
export { FlipkartParser } from "./merchants/flipkart.js";
export { MyntraParser } from "./merchants/myntra.js";
export { SwiggyParser } from "./merchants/swiggy.js";
export { ZomatoParser } from "./merchants/zomato.js";
export { detectCreditSignal } from "./credit-detect.js";
export { detectEmiSignal } from "./emi-detect.js";
export type { ParsedEmiSignal } from "./emi-detect.js";
export * from "./types.js";
export * from "./metrics.js";
