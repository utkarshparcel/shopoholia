/**
 * U026 — Request missing GST / tax invoice from merchant (template email / ticket).
 * Complements W041 vault search jump when the invoice is not in the archive yet.
 */

export type GstInvoiceRequestInput = {
  merchant: string;
  orderRef?: string | null;
  purchasedAt?: string | Date | null;
  itemTitle?: string | null;
  /** Override support contact; defaults to support@{merchant-slug}.com */
  contactOverride?: string | null;
  totalMinor?: number | null;
  currency?: string | null;
};

export type GstInvoiceRequestPacket = {
  subject: string;
  emailBody: string;
  /** mailto / https / tel when contact is usable. */
  requestUrl: string | null;
  shareText: string;
  contact: string;
};

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function merchantSlug(merchant: string): string {
  return merchant
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 32);
}

/** Guess a support mailbox when OCR / user did not provide one. */
export function defaultInvoiceContactFromMerchant(merchant: string): string {
  const slug = merchantSlug(merchant);
  return slug ? `support@${slug}.com` : "support@merchant.com";
}

function purchasedYmd(purchasedAt: string | Date | null | undefined): string | null {
  if (!purchasedAt) return null;
  const d = purchasedAt instanceof Date ? purchasedAt : new Date(purchasedAt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function gstInvoiceRequestBody(input: GstInvoiceRequestInput): string {
  const lines = [
    `Hello,`,
    ``,
    `Please send a GST / tax invoice for my order.`,
    ``,
    `Merchant: ${input.merchant.trim()}`,
  ];
  if (input.orderRef?.trim()) lines.push(`Order / invoice ref: ${input.orderRef.trim()}`);
  const ymd = purchasedYmd(input.purchasedAt);
  if (ymd) lines.push(`Purchase date: ${ymd}`);
  if (input.itemTitle?.trim()) lines.push(`Item: ${input.itemTitle.trim()}`);
  if (input.totalMinor != null && input.totalMinor > 0) {
    const cur = (input.currency ?? "INR").trim() || "INR";
    lines.push(`Amount (minor units): ${input.totalMinor} ${cur}`);
  }
  lines.push(``, `Sent via WORN Vault.`);
  return lines.join("\n");
}

/** Prefill merchant GST invoice request (mailto / portal / share). */
export function buildGstInvoiceRequestPacket(
  input: GstInvoiceRequestInput,
): GstInvoiceRequestPacket {
  const merchant = input.merchant.trim() || "Merchant";
  const contact =
    (input.contactOverride ?? "").trim() || defaultInvoiceContactFromMerchant(merchant);
  const subject = `GST invoice request — ${merchant}${
    input.orderRef?.trim() ? ` (${input.orderRef.trim()})` : ""
  }`;
  const emailBody = gstInvoiceRequestBody({ ...input, merchant });
  const shareText = [subject, "", emailBody].join("\n");

  let requestUrl: string | null = null;
  if (isHttpUrl(contact)) {
    requestUrl = contact;
  } else if (isEmail(contact) || contact.includes("@")) {
    requestUrl = `mailto:${contact}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
  }

  return { subject, emailBody, requestUrl, shareText, contact };
}

/** Vault deep-link when a matching invoice arrives after request. */
export function gstInvoiceArrivedHref(input: {
  receiptId?: string | null;
  merchant?: string | null;
}): string {
  const params = new URLSearchParams();
  params.set("focus", "gst");
  if (input.receiptId?.trim()) params.set("receiptId", input.receiptId.trim());
  if (input.merchant?.trim()) params.set("merchant", input.merchant.trim());
  return `/(closet)/vault?${params.toString()}`;
}
