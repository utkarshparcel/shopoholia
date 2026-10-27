import { BaseMerchantParser } from "./base.js";

export class AmazonParser extends BaseMerchantParser {
  readonly id = "amazon";
  readonly merchant = "AMAZON";
  protected readonly domains = ["amazon.in", "amazon.com", "amazon.co.uk", "amazon."];
  protected readonly subjects = ["amazon"];
}
