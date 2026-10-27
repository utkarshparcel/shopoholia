/** W041 — deep-link from a return item into Vault GST / invoice search. */

import { localDayKey } from './localDay';

export type GstFromReturnInput = {
  merchant?: string | null;
  /** ISO datetime — used to seed a ±45d search window around the return. */
  createdAt?: string | null;
  /** Optional purchase date when known (preferred over createdAt). */
  purchasedAt?: string | null;
};

export type GstInvoiceSearchPrefill = {
  merchant?: string;
  from?: string;
  to?: string;
};

function ymd(iso: string): string | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return localDayKey(new Date(t));
}

/** Prefill merchant + date range for receipts search (export stays on Receipts tab). */
export function gstInvoiceSearchPrefill(input: GstFromReturnInput): GstInvoiceSearchPrefill {
  const merchant = input.merchant?.trim() || undefined;
  const anchor = input.purchasedAt?.trim() || input.createdAt?.trim();
  if (!anchor) return { merchant };

  const center = Date.parse(anchor);
  if (Number.isNaN(center)) return { merchant };

  // Days where the user is (MOB 20): the UTC day is still yesterday in India until 05:30.
  const from = localDayKey(new Date(center), -45);
  const to = localDayKey(new Date(center), 14);
  return { merchant, from, to };
}

/** Expo-router href into vault receipts with GST search prefill. */
export function gstInvoiceHrefFromReturn(input: GstFromReturnInput): string {
  const prefill = gstInvoiceSearchPrefill(input);
  const params = new URLSearchParams();
  params.set('focus', 'gst');
  if (prefill.merchant) params.set('merchant', prefill.merchant);
  if (prefill.from) params.set('from', prefill.from);
  if (prefill.to) params.set('to', prefill.to);
  return `/(closet)/vault?${params.toString()}`;
}

export function isGstFocus(focus: string | string[] | undefined): boolean {
  const v = Array.isArray(focus) ? focus[0] : focus;
  return v === 'gst' || v === 'receipts';
}

export { ymd };
