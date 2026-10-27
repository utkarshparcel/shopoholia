/** A raw inbound email, normalized by an `EmailConnector` (B2) before parsing. */
export interface RawEmailMessage {
  messageId: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** ISO 8601 timestamp the message was received. */
  receivedAt: string;
}

export interface ParsedPurchaseItem {
  title: string;
  category?: string;
  brand?: string;
  /** Amount in minor units (e.g. paise for INR, cents for USD). */
  priceMinor: number;
  qty: number;
  imageKey?: string;
}

/** Gift-card / store-credit / loyalty signal extracted from an ingest message. */
export interface ParsedCreditSignal {
  kind: "GIFT_CARD" | "STORE_CREDIT" | "LOYALTY_POINTS";
  /** Amount in minor units (points × 100 when loyalty). */
  balanceMinor: number;
  currency: string;
  /** ISO 8601 expiry when the message mentions one. */
  expiresAt?: string | null;
}

export interface ParsedPurchase {
  merchant: string;
  orderRef?: string;
  /** ISO 8601 timestamp of the purchase. */
  purchasedAt: string;
  currency: string;
  /** Total amount in minor units. */
  totalMinor: number;
  items: ParsedPurchaseItem[];
  /** Parser confidence in [0,1]. */
  confidence: number;
  parserId: string;
  /** Present when the message is a gift card, store credit, or refund-to-credit. */
  credit?: ParsedCreditSignal;
  /** Delivery tracker fields from shipping emails. */
  deliveryStatus?:
    | "ORDERED"
    | "SHIPPED"
    | "IN_TRANSIT"
    | "OUT_FOR_DELIVERY"
    | "DELIVERED"
    | "FAILED"
    | "CANCELLED";
  etaAt?: string | null;
  trackingCode?: string | null;
}

export interface ParsedResult {
  matched: boolean;
  parserId?: string;
  purchase?: ParsedPurchase;
}

/** A per-merchant parser: detects whether it can handle a message, then
 * extracts a structured `ParsedPurchase`. */
export interface MerchantParser {
  readonly id: string;
  readonly merchant: string;
  canParse(merchant: RawEmailMessage): boolean;
  parse(merchant: RawEmailMessage): ParsedPurchase;
}

/** Source-agnostic connector (Gmail now, Outlook later) that yields raw
 * messages for the parser framework to consume. */
export interface EmailConnector {
  readonly id: string;
  listSince(cursor: string | null): Promise<{
    messages: RawEmailMessage[];
    nextCursor: string;
  }>;
}

export interface CoverageEvent {
  messageId: string;
  parserId: string | null;
  matched: boolean;
  merchant: string | null;
  /** true when a dedicated merchant parser matched (a "hit"), false for the
   * generic fallback or a full miss. Drives the coverage metric. */
  specific: boolean;
}

export interface MetricsSink {
  record(event: CoverageEvent): void;
}
