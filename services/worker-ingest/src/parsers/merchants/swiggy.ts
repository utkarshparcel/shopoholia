import { BaseMerchantParser } from "./base.js";

export class SwiggyParser extends BaseMerchantParser {
  readonly id = "swiggy";
  readonly merchant = "SWIGGY";
  protected readonly domains = ["swiggy.com", "swiggy."];
  protected readonly subjects = ["swiggy"];
}
