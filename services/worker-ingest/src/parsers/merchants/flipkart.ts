import { BaseMerchantParser } from "./base.js";

export class FlipkartParser extends BaseMerchantParser {
  readonly id = "flipkart";
  readonly merchant = "FLIPKART";
  protected readonly domains = ["flipkart.com", "flipkart."];
  protected readonly subjects = ["flipkart"];
}
