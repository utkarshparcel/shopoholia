/**
 * W093 — WhatsApp Status asset generator (9:16, no PII).
 * Builds a Status-safe layout + SVG from found-money share (digit-blurred).
 */

import {
  buildFoundMoneyShareCard,
  type FoundMoneyShareInput,
} from "./found-money.js";
import { FOUND_MONEY_SHARE_WATERMARK } from "./found-money.js";

/** WhatsApp Status / Stories frame. */
export const WA_STATUS_WIDTH = 1080;
export const WA_STATUS_HEIGHT = 1920;
export const WA_STATUS_ASPECT = "9:16" as const;

/** Safe margins so UI chrome / Status stickers don’t cover copy. */
export const WA_STATUS_SAFE_ZONE = {
  top: 160,
  bottom: 280,
  left: 96,
  right: 96,
} as const;

export type WhatsAppStatusAssetInput = FoundMoneyShareInput & {
  /** Optional referral / landing URL (no PII). */
  deepLink?: string | null;
};

export type WhatsAppStatusAsset = {
  width: number;
  height: number;
  aspectRatio: typeof WA_STATUS_ASPECT;
  safeZone: typeof WA_STATUS_SAFE_ZONE;
  watermark: string;
  /** Digit-blurred headline — never includes raw merchants or card digits. */
  headline: string;
  subline: string;
  shareText: string;
  /** Minimal SVG for export / preview (no external fonts or PII). */
  svg: string;
  mimeType: "image/svg+xml";
  fileName: string;
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Build a 9:16 WhatsApp Status asset from found-money totals.
 * Always uses Reels blur preset — no merchants, digit-blurred amount, worn.app watermark.
 */
export function buildWhatsAppStatusAsset(
  input: WhatsAppStatusAssetInput,
): WhatsAppStatusAsset {
  const card = buildFoundMoneyShareCard({
    ...input,
    blurPreset: "reels",
  });
  const watermark = card.watermark || FOUND_MONEY_SHARE_WATERMARK;
  const headline = card.headline;
  const subline =
    card.accountCount > 0
      ? card.accountCount === 1
        ? "1 unused gift card / store credit"
        : `${card.accountCount} unused gift cards & credits`
      : "Forgotten credit check";
  const deepLink = input.deepLink?.trim() || null;
  const shareText = [headline, subline, deepLink, `— ${watermark}`]
    .filter((line): line is string => Boolean(line && line.length > 0))
    .join("\n");

  const cx = WA_STATUS_WIDTH / 2;
  const titleY = WA_STATUS_SAFE_ZONE.top + 280;
  const subY = titleY + 120;
  const markY = WA_STATUS_HEIGHT - WA_STATUS_SAFE_ZONE.bottom - 40;

  const svg = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WA_STATUS_WIDTH}" height="${WA_STATUS_HEIGHT}" viewBox="0 0 ${WA_STATUS_WIDTH} ${WA_STATUS_HEIGHT}">`,
    `<rect width="100%" height="100%" fill="#1a1614"/>`,
    `<text x="${cx}" y="${titleY}" fill="#f5efe6" font-family="system-ui,sans-serif" font-size="52" font-weight="600" text-anchor="middle">${escapeXml(headline)}</text>`,
    `<text x="${cx}" y="${subY}" fill="#c4b8a8" font-family="system-ui,sans-serif" font-size="36" text-anchor="middle">${escapeXml(subline)}</text>`,
    `<text x="${cx}" y="${markY}" fill="#8a7f72" font-family="system-ui,sans-serif" font-size="28" text-anchor="middle">${escapeXml(watermark)}</text>`,
    `</svg>`,
  ].join("");

  return {
    width: WA_STATUS_WIDTH,
    height: WA_STATUS_HEIGHT,
    aspectRatio: WA_STATUS_ASPECT,
    safeZone: WA_STATUS_SAFE_ZONE,
    watermark,
    headline,
    subline,
    shareText,
    svg,
    mimeType: "image/svg+xml",
    fileName: "worn-wa-status.svg",
  };
}
