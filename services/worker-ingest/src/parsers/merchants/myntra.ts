import { BaseMerchantParser } from "./base.js";

export class MyntraParser extends BaseMerchantParser {
  readonly id = "myntra";
  readonly merchant = "MYNTRA";
  protected readonly domains = ["myntra.com", "myntra."];
  protected readonly subjects = ["myntra"];
}
