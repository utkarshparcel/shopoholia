import { BaseMerchantParser } from "./base.js";

export class SwiggyParser extends BaseMerchantParser {
  readonly id = "swiggy";
  readonly merchant = "SWIGGY";
  protected readonly domains = ["swiggy.com", "swiggy.in"];
  protected readonly subjects = ["swiggy"];
}
