import { BaseMerchantParser } from "./base.js";

export class ZomatoParser extends BaseMerchantParser {
  readonly id = "zomato";
  readonly merchant = "ZOMATO";
  protected readonly domains = ["zomato.com", "zomato."];
  protected readonly subjects = ["zomato"];
}
