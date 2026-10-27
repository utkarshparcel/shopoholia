/**
 * One-tap warranty claim rail: build a prefilled mailto / https / tel URL
 * from OCR claim contact + item / merchant / order refs.
 * U011 — claim packet (email body + attachment keys) + 24h undo window.
 */

export type WarrantyClaimInput = {
  claimContact: string | null | undefined;
  itemTitle: string;
  provider: string;
  /** Merchant order / invoice ref when known. */
  orderRef?: string | null;
  coverageUntil?: string | Date | null;
  /** Receipt / image object keys to list as attachments (no binary). */
  receiptImageKey?: string | null;
  receiptId?: string | null;
};

/** Undo claim is allowed for this long after claim (U011). */
export const WARRANTY_UNCLAIM_WINDOW_MS = 24 * 60 * 60 * 1000;

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isTel(value: string): boolean {
  // Accept bare international numbers or tel:+91… / tel:1800…
  return /^(?:tel:)?\+?\d[\d\s().-]{6,}\d$/i.test(value);
}

export function claimBody(input: WarrantyClaimInput): string {
  const until = input.coverageUntil
    ? new Date(input.coverageUntil).toISOString().slice(0, 10)
    : null;
  const lines = [
    `I would like to file a warranty claim.`,
    ``,
    `Item: ${input.itemTitle}`,
    `Merchant / provider: ${input.provider}`,
  ];
  if (input.orderRef) lines.push(`Order / invoice: ${input.orderRef}`);
  if (until) lines.push(`Coverage until: ${until}`);
  lines.push(``, `Sent via WORN Vault.`);
  return lines.join("\n");
}

export type WarrantyClaimPacket = {
  /** Prefilled email / claim letter body. */
  emailBody: string;
  /** Subject line for mailto / share. */
  subject: string;
  /** Attachment keys (receipt image / receipt id) — no card or PII beyond order ref. */
  attachmentKeys: string[];
  /** Plain-text packet for share sheet (body + attachments list). */
  shareText: string;
};

/** Build claim packet: email body + receipt attachment keys for share sheet. */
export function buildWarrantyClaimPacket(
  input: WarrantyClaimInput,
): WarrantyClaimPacket {
  const emailBody = claimBody(input);
  const subject = `Warranty claim: ${input.itemTitle} (${input.provider})`;
  const attachmentKeys: string[] = [];
  if (input.receiptImageKey?.trim()) {
    attachmentKeys.push(input.receiptImageKey.trim());
  }
  if (input.receiptId?.trim()) {
    attachmentKeys.push(`receipt:${input.receiptId.trim()}`);
  }
  const shareText = [
    subject,
    "",
    emailBody,
    "",
    "Attachments:",
    ...(attachmentKeys.length
      ? attachmentKeys.map((k) => `- ${k}`)
      : ["- (none — attach receipt photo manually)"]),
  ].join("\n");
  return { emailBody, subject, attachmentKeys, shareText };
}

/**
 * Whether undo-claim is still allowed (within 24h of claimedAt / claim updatedAt).
 */
export function canUnclaimWarranty(
  claimedAt: string | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!claimedAt) return false;
  const t = new Date(claimedAt).getTime();
  if (Number.isNaN(t)) return false;
  return now.getTime() - t <= WARRANTY_UNCLAIM_WINDOW_MS;
}

export function warrantyUnclaimExpiredCopy(): string {
  return "Undo window closed (24 hours after claim).";
}

/**
 * Builds a one-tap claim URL.
 * - email → mailto with subject + body (merchant, item, order refs)
 * - http(s) → deep-link as-is (claim portal)
 * - phone / tel: → tel: link
 * Returns null when there is no usable contact.
 */
export function buildWarrantyClaimUrl(input: WarrantyClaimInput): string | null {
  const raw = (input.claimContact ?? "").trim();
  if (!raw) return null;

  if (isHttpUrl(raw)) return raw;

  if (isEmail(raw)) {
    const subject = encodeURIComponent(
      `Warranty claim: ${input.itemTitle} (${input.provider})`,
    );
    const body = encodeURIComponent(claimBody(input));
    return `mailto:${raw}?subject=${subject}&body=${body}`;
  }

  if (isTel(raw)) {
    const digits = raw.replace(/^tel:/i, "").replace(/[^\d+]/g, "");
    return digits ? `tel:${digits}` : null;
  }

  // Bare support handle without @ — treat as email local@provider domain guess only if it looks like one
  if (raw.includes("@")) {
    const subject = encodeURIComponent(
      `Warranty claim: ${input.itemTitle} (${input.provider})`,
    );
    const body = encodeURIComponent(claimBody(input));
    return `mailto:${raw}?subject=${subject}&body=${body}`;
  }

  return null;
}

/** Guess a support mailbox from a merchant name when OCR did not yield one. */
export function defaultClaimContactFromMerchant(merchant: string): string {
  const slug = merchant
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 32);
  return slug ? `support@${slug}.com` : "support@merchant.com";
}
