/**
 * N44-TAX-PACK — yearly workwear tax pack (invoices + spend CSV/ZIP).
 * Filters by calendar year, Indian financial year (Apr–Mar) or explicit from/to date range, with
 * day boundaries in the user's time zone. Spend is dated by the purchase, not by when the item
 * was added to the closet.
 */

import { addDaysToKey, localDayRange, readReceiptGstin, resolveTimeZone } from "@worn/shared";
import { isWorkwearItem, type WorkwearItemLike } from "./workwear-rotation.js";

export type TaxPackRangeInput = {
  year?: number;
  /** Indian financial year starting 1 April of this year (fy=2025 → 2025-04-01…2026-03-31). */
  fy?: number;
  from?: string; // YYYY-MM-DD or ISO
  to?: string;
  /** IANA zone for day boundaries (the user's `timeZone`); UTC when absent, the default zone when invalid. */
  timeZone?: string | null;
};

export type TaxPackRange = {
  from: Date;
  to: Date;
  label: string;
  year: number | null;
};

export type TaxPackSpendRow = {
  wardrobeItemId: string;
  category: string;
  brand: string | null;
  costMinor: number;
  purchasedAt: string;
  tags: string[];
};

export type TaxPackInvoiceRow = {
  receiptId: string;
  merchant: string;
  purchasedAt: string;
  totalMinor: number;
  gstin: string | null;
  purchaseId: string | null;
  imageKey: string;
};

export type TaxPackBuildInput = {
  range: TaxPackRange;
  wardrobeItems: Array<
    WorkwearItemLike & {
      id: string;
      costMinor: number;
      brand?: string | null;
      createdAt: Date;
      purchaseItemId?: string | null;
    }
  >;
  receipts: Array<{
    id: string;
    merchant: string;
    purchasedAt: Date;
    totalMinor: number;
    imageKey: string;
    purchaseId: string | null;
    ocrJson: Record<string, unknown>;
  }>;
  /** purchaseItemId → purchaseId */
  purchaseIdByItemId?: Map<string, string>;
  /** purchaseId → when it was bought; dates a linked item's spend instead of its createdAt. */
  purchasedAtByPurchaseId?: Map<string, Date>;
};

export type TaxPackResult = {
  from: string;
  to: string;
  label: string;
  year: number | null;
  totalSpendMinor: number;
  spendRowCount: number;
  invoiceCount: number;
  spend: TaxPackSpendRow[];
  invoices: TaxPackInvoiceRow[];
  spendCsv: string;
  invoicesCsv: string;
};

/** First and last instant of local day `dateKey` (YYYY-MM-DD) in `tz`, inclusive. */
function localDayBounds(dateKey: string, tz: string): { start: Date; last: Date } {
  const { start, end } = localDayRange(dateKey, tz);
  return { start, last: new Date(end.getTime() - 1) };
}

function parseDayBoundary(raw: string, endOfDay: boolean, tz: string): Date | null {
  const day = raw.slice(0, 10);
  if (raw.length > 10 || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  const bounds = localDayBounds(day, tz);
  return endOfDay ? bounds.last : bounds.start;
}

/**
 * Resolve a calendar year, an Indian financial year or explicit from/to days into an inclusive
 * range whose day boundaries are local to `timeZone`.
 */
export function resolveTaxPackRange(input: TaxPackRangeInput): TaxPackRange | { error: string } {
  const tz = input.timeZone == null ? "UTC" : resolveTimeZone(input.timeZone);
  if (input.from || input.to) {
    if (!input.from || !input.to) {
      return { error: "from and to are both required when using a custom range" };
    }
    const from = parseDayBoundary(input.from, false, tz);
    const to = parseDayBoundary(input.to, true, tz);
    if (!from || !to) return { error: "from/to must be YYYY-MM-DD or ISO datetime" };
    if (from.getTime() > to.getTime()) return { error: "from must be on or before to" };
    return {
      from,
      to,
      label: `${input.from.slice(0, 10)}…${input.to.slice(0, 10)}`,
      year: null,
    };
  }

  if (input.fy != null) {
    const fy = input.fy;
    if (!Number.isInteger(fy) || fy < 2000 || fy > 2100) {
      return { error: "fy must be an integer between 2000 and 2100" };
    }
    if (input.year != null) return { error: "use either year or fy, not both" };
    return {
      from: localDayBounds(`${fy}-04-01`, tz).start,
      to: localDayBounds(addDaysToKey(`${fy + 1}-04-01`, -1), tz).last,
      label: `FY${fy}-${String((fy + 1) % 100).padStart(2, "0")}`,
      year: null,
    };
  }

  const year = input.year ?? Number(localYear(new Date(), tz));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { error: "year must be an integer between 2000 and 2100" };
  }
  return {
    from: localDayBounds(`${year}-01-01`, tz).start,
    to: localDayBounds(`${year}-12-31`, tz).last,
    label: String(year),
    year,
  };
}

/** The local calendar year of `now` in `tz`. */
function localYear(now: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric" }).format(now);
}

export function isDateInRange(d: Date, from: Date, to: Date): boolean {
  const t = d.getTime();
  return t >= from.getTime() && t <= to.getTime();
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function rowsToCsv(header: string[], rows: string[][]): string {
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(row.map((c) => csvEscape(c)).join(","));
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Build workwear-only spend + invoice CSVs for the resolved date range.
 * Invoices are included when the receipt's purchase links to a workwear wardrobe item
 * in-range, or when the receipt itself falls in-range and any workwear item shares that purchase.
 */
export function buildWorkwearTaxPack(input: TaxPackBuildInput): TaxPackResult {
  const { range } = input;
  const workwear = input.wardrobeItems.filter((it) => isWorkwearItem(it));

  const spend: TaxPackSpendRow[] = [];
  const workwearPurchaseIds = new Set<string>();
  const purchaseIdByItemId = input.purchaseIdByItemId ?? new Map<string, string>();

  const purchasedAtByPurchaseId = input.purchasedAtByPurchaseId ?? new Map<string, Date>();
  for (const it of workwear) {
    // The purchase date when the item came from a purchase; a manual item only has createdAt.
    const linkedPurchaseId = it.purchaseItemId ? purchaseIdByItemId.get(it.purchaseItemId) : undefined;
    const purchasedAt =
      (linkedPurchaseId ? purchasedAtByPurchaseId.get(linkedPurchaseId) : undefined) ?? it.createdAt;
    if (!isDateInRange(purchasedAt, range.from, range.to)) continue;
    spend.push({
      wardrobeItemId: it.id,
      category: it.category,
      brand: it.brand ?? null,
      costMinor: it.costMinor,
      purchasedAt: purchasedAt.toISOString(),
      tags: (it.tags ?? []).map((t) => String(t)),
    });
    if (it.purchaseItemId) {
      const pid = purchaseIdByItemId.get(it.purchaseItemId);
      if (pid) workwearPurchaseIds.add(pid);
    }
  }

  // Also mark purchases for any workwear item (even outside range) so linked invoices in-range qualify
  for (const it of workwear) {
    if (it.purchaseItemId) {
      const pid = purchaseIdByItemId.get(it.purchaseItemId);
      if (pid) workwearPurchaseIds.add(pid);
    }
  }

  const invoices: TaxPackInvoiceRow[] = [];
  for (const r of input.receipts) {
    if (!isDateInRange(r.purchasedAt, range.from, range.to)) continue;
    const linked =
      r.purchaseId != null && workwearPurchaseIds.has(r.purchaseId)
        ? true
        : // Fallback: include in-range receipts when there is any in-range workwear spend
          // and no purchase links exist yet (manual wardrobe workwear).
          spend.length > 0 && workwearPurchaseIds.size === 0;
    if (!linked && workwearPurchaseIds.size > 0) continue;
    if (!linked && spend.length === 0) continue;
    invoices.push({
      receiptId: r.id,
      merchant: r.merchant,
      purchasedAt: r.purchasedAt.toISOString(),
      totalMinor: r.totalMinor,
      gstin: readReceiptGstin({ ocrJson: r.ocrJson }),
      purchaseId: r.purchaseId,
      imageKey: r.imageKey,
    });
  }

  // When purchase links exist, only linked invoices; when none, keep fallback invoices above.
  // If we have purchase links but zero linked invoices matched, invoices stays empty — correct.

  const totalSpendMinor = spend.reduce((a, s) => a + s.costMinor, 0);

  const spendCsv = rowsToCsv(
    ["wardrobeItemId", "category", "brand", "costMinor", "purchasedAt", "tags"],
    spend.map((s) => [
      s.wardrobeItemId,
      s.category,
      s.brand ?? "",
      String(s.costMinor),
      s.purchasedAt,
      s.tags.join("|"),
    ]),
  );

  const invoicesCsv = rowsToCsv(
    ["receiptId", "merchant", "purchasedAt", "totalMinor", "gstin", "purchaseId", "imageKey"],
    invoices.map((i) => [
      i.receiptId,
      i.merchant,
      i.purchasedAt,
      String(i.totalMinor),
      i.gstin ?? "",
      i.purchaseId ?? "",
      i.imageKey,
    ]),
  );

  return {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    label: range.label,
    year: range.year,
    totalSpendMinor,
    spendRowCount: spend.length,
    invoiceCount: invoices.length,
    spend,
    invoices,
    spendCsv,
    invoicesCsv,
  };
}

/** Minimal ZIP (store only, no compression) for multi-CSV tax pack download. */
export function buildStoreZip(files: Array<{ name: string; content: string | Uint8Array }>): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = typeof file.content === "string" ? encoder.encode(file.content) : file.content;
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true); // store
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    localParts.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length;
  }

  const centralSize = centralParts.reduce((a, p) => a + p.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const total =
    localParts.reduce((a, p) => a + p.length, 0) + centralSize + end.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of localParts) {
    out.set(p, o);
    o += p.length;
  }
  for (const p of centralParts) {
    out.set(p, o);
    o += p.length;
  }
  out.set(end, o);
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}
