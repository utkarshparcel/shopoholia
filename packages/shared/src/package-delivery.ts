import type { PackageDeliveryStatus } from "./schemas/packages.js";

/**
 * Infer delivery status / ETA / tracking from ingest subject+body.
 * Conservative: defaults to ORDERED when no shipping signal.
 */
export function detectDeliveryFromText(
  subject: string,
  text: string,
): {
  deliveryStatus: PackageDeliveryStatus;
  etaAt: string | null;
  trackingCode: string | null;
} {
  const hay = `${subject}\n${text}`;
  let deliveryStatus: PackageDeliveryStatus = "ORDERED";

  if (/\b(cancelled|canceled|order\s+cancelled)\b/i.test(hay)) {
    deliveryStatus = "CANCELLED";
  } else if (/\b(delivery\s+failed|undelivered|rto|return\s+to\s+origin)\b/i.test(hay)) {
    deliveryStatus = "FAILED";
  } else if (/\b(delivered|successfully\s+delivered|was\s+delivered)\b/i.test(hay)) {
    deliveryStatus = "DELIVERED";
  } else if (/\b(out\s+for\s+delivery)\b/i.test(hay)) {
    deliveryStatus = "OUT_FOR_DELIVERY";
  } else if (/\b(in\s+transit|on\s+the\s+way|dispatched)\b/i.test(hay)) {
    deliveryStatus = "IN_TRANSIT";
  } else if (/\b(shipped|has\s+shipped|shipment)\b/i.test(hay)) {
    deliveryStatus = "SHIPPED";
  }

  const trackingCode = extractTrackingCode(hay);
  const etaAt = extractEta(hay);

  return { deliveryStatus, etaAt, trackingCode };
}

function extractTrackingCode(hay: string): string | null {
  const patterns = [
    /(?:tracking(?:\s*(?:number|id|#|no\.?))?|awb|consignment)\s*[:#]?\s*([A-Z0-9]{8,24})/i,
    /\b(1Z[A-Z0-9]{10,})\b/i,
  ];
  for (const re of patterns) {
    const m = hay.match(re);
    if (m?.[1]) return m[1].toUpperCase();
  }
  return null;
}

/** U018 — carrier codes detected from pasted tracking patterns. */
export type DetectedCarrier =
  | "UPS"
  | "USPS"
  | "FEDEX"
  | "DHL"
  | "BLUEDART"
  | "DELHIVERY"
  | "UNKNOWN";

/**
 * Parse carrier from a pasted tracking number (pattern heuristics only — no live carrier API).
 */
export function detectCarrierFromTracking(raw: string): {
  trackingCode: string;
  carrier: DetectedCarrier;
} | null {
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!cleaned || cleaned.length < 8) return null;

  if (/^1Z[A-Z0-9]{10,}$/.test(cleaned)) {
    return { trackingCode: cleaned, carrier: "UPS" };
  }
  if (/^\d{12,15}$/.test(cleaned) && cleaned.startsWith("94")) {
    return { trackingCode: cleaned, carrier: "USPS" };
  }
  if (/^\d{12,22}$/.test(cleaned) && (cleaned.startsWith("96") || cleaned.length === 12)) {
    return { trackingCode: cleaned, carrier: "FEDEX" };
  }
  if (/^[0-9]{10}$/.test(cleaned) || /^[A-Z]{3}\d{8,}$/.test(cleaned)) {
    // India AWB-ish — prefer Delhivery when alphanumeric, BlueDart numeric common
    if (/^[A-Z]/.test(cleaned)) return { trackingCode: cleaned, carrier: "DELHIVERY" };
    return { trackingCode: cleaned, carrier: "BLUEDART" };
  }
  if (/^[A-Z0-9]{8,24}$/.test(cleaned)) {
    return { trackingCode: cleaned, carrier: "UNKNOWN" };
  }
  return null;
}

/** Deep link to carrier tracking page (stub — opens public tracker when known). */
export function carrierTrackingUrl(
  carrier: DetectedCarrier,
  trackingCode: string,
): string | null {
  const code = encodeURIComponent(trackingCode);
  switch (carrier) {
    case "UPS":
      return `https://www.ups.com/track?tracknum=${code}`;
    case "USPS":
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${code}`;
    case "FEDEX":
      return `https://www.fedex.com/fedextrack/?trknbr=${code}`;
    case "DHL":
      return `https://www.dhl.com/en/express/tracking.html?AWB=${code}`;
    case "BLUEDART":
      return `https://www.bluedart.com/tracking?track=${code}`;
    case "DELHIVERY":
      return `https://www.delhivery.com/track/package/${code}`;
    default:
      return null;
  }
}

/** Parse common ETA phrases into ISO datetime (noon UTC on that day). */
export function extractEta(hay: string, now: Date = new Date()): string | null {
  const byDate = hay.match(
    /(?:estimated\s+delivery|arriving(?:\s+by)?|expected\s+(?:by|on)|delivery\s+(?:by|on))\s*[:-]?\s*(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/i,
  );
  if (byDate) {
    const day = Number(byDate[1]);
    const mon = monthIndex(byDate[2]!);
    const year = Number(byDate[3]);
    if (mon !== null && day >= 1 && day <= 31) {
      const d = new Date(Date.UTC(year, mon, day, 12, 0, 0));
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
  }

  if (/\b(arriving\s+today|delivery\s+today)\b/i.test(hay)) {
    const d = new Date(now);
    d.setUTCHours(18, 0, 0, 0);
    return d.toISOString();
  }
  if (/\b(arriving\s+tomorrow|delivery\s+tomorrow)\b/i.test(hay)) {
    const d = new Date(now.getTime() + 86_400_000);
    d.setUTCHours(18, 0, 0, 0);
    return d.toISOString();
  }

  return null;
}

function monthIndex(name: string): number | null {
  const key = name.slice(0, 3).toLowerCase();
  const map: Record<string, number> = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };
  return map[key] ?? null;
}

/** Default ETA guess when ingest has no date: +N days by status. */
export function defaultEtaForStatus(
  status: PackageDeliveryStatus,
  purchasedAt: Date,
  now: Date = new Date(),
): Date | null {
  const base = purchasedAt.getTime() > now.getTime() - 7 * 86_400_000 ? purchasedAt : now;
  const days: Record<PackageDeliveryStatus, number | null> = {
    ORDERED: 5,
    SHIPPED: 3,
    IN_TRANSIT: 2,
    OUT_FOR_DELIVERY: 0,
    DELIVERED: null,
    FAILED: null,
    CANCELLED: null,
  };
  const d = days[status];
  if (d === null) return null;
  return new Date(base.getTime() + d * 86_400_000);
}

/** Happy-path delivery steps for package timeline UX (W039). */
export const PACKAGE_DELIVERY_PIPELINE = [
  { id: "ORDERED" as const, label: "Ordered" },
  { id: "SHIPPED" as const, label: "Shipped" },
  { id: "IN_TRANSIT" as const, label: "In transit" },
  { id: "OUT_FOR_DELIVERY" as const, label: "Out for delivery" },
  { id: "DELIVERED" as const, label: "Delivered" },
];

export type PackageTimelineStepState = "done" | "current" | "todo" | "failed";

export type PackageTimelineStep = {
  id: string;
  label: string;
  state: PackageTimelineStepState;
};

const PIPELINE_INDEX: Record<string, number> = Object.fromEntries(
  PACKAGE_DELIVERY_PIPELINE.map((s, i) => [s.id, i]),
);

/**
 * Build delivery status steps for Packages panel (W039).
 * FAILED / CANCELLED append as a failed terminal after the last reached step.
 */
export function packageDeliveryTimeline(
  deliveryStatus: PackageDeliveryStatus | string,
): PackageTimelineStep[] {
  if (deliveryStatus === "FAILED" || deliveryStatus === "CANCELLED") {
    return [
      { id: "ORDERED", label: "Ordered", state: "done" as const },
      { id: "SHIPPED", label: "Shipped", state: "done" as const },
      {
        id: deliveryStatus,
        label: deliveryStatus === "FAILED" ? "Delivery failed" : "Cancelled",
        state: "failed" as const,
      },
    ];
  }

  const idx = PIPELINE_INDEX[deliveryStatus];
  if (idx == null) {
    return [{ id: deliveryStatus, label: deliveryStatus, state: "current" }];
  }

  return PACKAGE_DELIVERY_PIPELINE.map((s, i) => {
    let state: PackageTimelineStepState = "todo";
    if (i < idx) state = "done";
    else if (i === idx) state = "current";
    return { id: s.id, label: s.label, state };
  });
}
