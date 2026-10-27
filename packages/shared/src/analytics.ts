import { z } from "zod";

/** Phase I funnel events — wire to PostHog/Mixpanel in production. */
export const ANALYTICS_EVENTS = [
  "install",
  "avatar_complete",
  "add_to_cart",
  "checkout",
  "wait_complete",
  "reveal_opened",
  "reveal_rated",
  "unlock",
  "share",
  "affiliate_click",
  "iap_purchase",
  "generate_render",
  "rush_to_express",
  "push_permission",
  "push_opened",
  // --- Universe P0 cross-cutting flows ---
  "consent_granted",
  "consent_revoked",
  "vault_export",
  "vault_deleted",
  "credit_added",
  "credit_spent",
  "credit_spend_undone",
  "credits_merged",
  "credit_expiry_handled",
  "credit_autofilled",
  "credit_captured",
  "credit_balance_confirmed",
  /** U004 — user confirmed stale balance and proceeded to Use it now. */
  "stale_balance_override",
  "ingestion_connected",
  "ingestion_activity_viewed",
  "ingestion_corrected",
  "parser_feedback",
  "purchases_merged",
  "purchases_split",
  "ingestion_source_paused",
  "ingestion_source_disconnected",
  "ingestion_merchant_muted",
  "sms_ingested",
  "receipt_uploaded",
  "receipt_confirmed",
  "receipt_corrected",
  "receipt_searched",
  "receipt_exported",
  "warranty_created",
  "warranty_auto_detected",
  "warranty_claimed",
  "warranty_snoozed",
  "found_money_viewed",
  /** Seconds from Closet delight start → first credit / OAuth / demo seed. */
  "time_to_found_money",
  /** W095 — Closet cold-start TTI (ms) vs 2s budget. */
  "closet_cold_start_tti",
  /** W001 — user exited sample/demo vault credit. */
  "demo_exited",
  /** W004 — empty-state CTA tap (found-money vs outfit copy). */
  "empty_cta_tap",
  /** W008 — skipped compact Closet onboarding; props include `{seconds}`. */
  "onboarding_skipped",
  /** W008 — skipped progressive email prompt; props include `{seconds}`. */
  "email_prompt_skipped",
  "found_money_share_card",
  // --- Wave A WOW funnel (W001 / W004 / W008 / W013 / W032) ---
  /** “Add another” after first successful credit (W013). */
  "add_another_tap",
  /** One-tap merchant return portal open (W032). */
  "return_portal_open",
  /** W009 — receipt snap opened from vault hero. */
  "receipt_snap_hero",
  /** W016 — soonest-expiry countdown hero shown / push land. */
  "expiry_countdown_viewed",
  /** W017 — “Use it this weekend” chip. */
  "use_this_weekend_tap",
  /** W018 — returned to app after merchant deep link (no PII). */
  "merchant_deeplink_return",
  /** W020 — soonest-expiring focus mode toggle. */
  "soonest_focus_toggled",
  /** W021 — balance re-check nudge actions. */
  "balance_recheck_tap",
  "balance_recheck_reminder",
  /** W022 — first loyalty / coupon celebration. */
  "loyalty_first_celebration",
  /** W023 — WhatsApp IN found-money share (no PII). */
  "found_money_wa_share",
  /** N36 — family WhatsApp share with worn.app/r/{code}. */
  "family_found_money_share",
  /** W024 — attribution confirm screen after family share open. */
  "family_share_attribution_confirm",
  /** N36 — deep-link /r/{code} open logged for attribution. */
  "referral_attribution",
  /** W029 — soft price-drop alert card tap / dismiss. */
  "price_drop_card_tap",
  "price_drop_card_dismiss",
  /** U008 — price-drop act: watch / buy / dismiss-with-reason. */
  "price_drop_watch",
  "price_drop_buy",
  "price_drop_dismiss_reason",
  /** N14 / U006 — cashback claim queue. */
  "cashback_claim_created",
  "cashback_claim_marked",
  "cashback_claim_start",
  /** N13 / U007 — EMI tracker. */
  "emi_plan_created",
  "emi_payment",
  "emi_from_sms",
  /** W030 — EMI don’t-miss mark paid. */
  "emi_dont_miss_paid",
  "emi_marked_paid",
  /** N12 — brand price watch created. */
  "price_watch_created",
  "price_drop_scan",
  /** N35 — “Should I return?” friend poll. */
  "return_poll_created",
  "return_poll_voted",
  /** N38 — ask-a-friend outfit picks. */
  "ask_friend_poll_created",
  "ask_friend_voted",
  "ask_friend_winner_applied",
  "wardrobe_item_added",
  "wardrobe_item_viewed",
  "wardrobe_item_updated",
  "wardrobe_item_deleted",
  "wardrobe_tryon_requested",
  "wardrobe_goes_with",
  "wardrobe_shoe_bag_rotation",
  "wardrobe_missing_pieces",
  "wardrobe_capsule_updated",
  "wardrobe_bulk_imported",
  "wardrobe_from_purchases",
  "wardrobe_autotagged",
  "wardrobe_care_ocr",
  "wardrobe_dry_clean_drop_off",
  "wardrobe_dry_clean_confirm",
  "wardrobe_seasonal_swap",
  /** W066 — accessory attach/swap on today outfit. */
  "outfit_accessory_swapped",
  /** W067 — shoe/bag rotation nudge wear. */
  "shoe_bag_nudge_wear",
  /** W068 — missing-piece shop sheet affiliate. */
  "missing_piece_shop_click",
  /** W069 — repair spend chip tap. */
  "repair_spend_chip_tap",
  /** W070 — photo-dump batch review. */
  "wardrobe_photo_dump",
  "photo_dump_tag_confirmed",
  "photo_dump_tag_rejected",
  "outfit_generated",
  "outfit_viewed",
  "outfit_weather_rerolled",
  "outfit_alt_viewed",
  "outfit_selected",
  "outfit_complete_look",
  /** Device calendar event → occasion outfit (N03). */
  "cal_event_outfit",
  "travel_pack_built",
  "workwear_rotation_planned",
  "wear_logged",
  "waste_viewed",
  "waste_disposed",
  "waste_share_card",
  "waste_replace_twins",
  "waste_replace_twin_click",
  "waste_restyle_cta",
  "wear_challenge_started",
  "wear_challenge_completed",
  "rewear_streak_viewed",
  "rewear_streak_milestone",
  "declutter_challenge_started",
  "declutter_challenge_completed",
  "declutter_share_card",
  "budget_created",
  "accountant_viewed",
  "accountant_exported",
  "accountant_tax_pack_exported",
  "accountant_roi_season_viewed",
  "ledger_viewed",
  "budget_exceeded",
  "budget_nudge_shown",
  "spend_envelope_alerted",
  "cpw_goal_set",
  "cooling_off_started",
  "cooling_off_blocked",
  "cooling_off_overridden",
  "prebuy_fit_checked",
  "play_buy_tracked",
  "return_initiated",
  "return_confirmed",
  "return_refunded",
  /** WV01 / W033 — logistics pickup slot booked. */
  "return_pickup_scheduled",
  /** N17 — size-map board viewed. */
  "size_map_viewed",
  /** W036 — dismissible size tip. */
  "size_map_tip_dismiss",
  "package_status_updated",
  "package_delivered",
  "package_delivered_wardrobe",
  "rto_recovery_viewed",
  "rto_refund_started",
  "gst_invoice_from_return",
  /** U026 — request missing GST invoice. */
  "gst_invoice_requested",
  /** U027 — post-purchase cancel cooling-off viewed / cancelled. */
  "purchase_cooling_off_viewed",
  "purchase_cooling_off_cancelled",
  /** U028 — broken item return vs warranty router. */
  "broken_item_router",
  /** U029 — seller return label upload / mark used. */
  "return_label_uploaded",
  "return_label_used",
  /** U030 — package assigned to household member. */
  "package_assigned",
  "exchange_cta_tap",
  "return_cta_from_exchange",
  "dup_rebuy_warned",
  "recipient_created",
  "gift_idea_viewed",
  "gift_ordered",
  "measurement_saved",
  "template_viewed",
  "tailoring_ordered",
  "tailoring_reordered",
  "tailoring_previewed",
  "tailor_reviewed",
  "fabric_uploaded",
  "disposition_created",
  "disposition_price_suggested",
  "disposition_pickup_booked",
  /** N37 — invite-only closet swap circle. */
  "swap_circle_created",
  "swap_circle_joined",
  "swap_listing_created",
  "swap_listing_borrowed",
  "swap_listing_returned",
  "metrics_viewed",
  /** U031 — batch wear undo */
  "wear_log_undone",
  /** U032 — laundry rules */
  "laundry_rules_updated",
  "laundry_batch_cleaned",
  /** U033 — pin week day */
  "outfit_day_pinned",
  "outfit_day_unpinned",
  /** U034 — missing layer dismiss */
  "missing_layer_dismissed",
  /** U035 — dispose tree */
  "dispose_tree_resolved",
  "dispose_keep_snoozed",
  /** U036 — CPW threshold */
  "cpw_threshold_updated",
  "cpw_threshold_alerted",
  /** U037 — measure update */
  "measurement_updated",
  /** U038 — tailor chase */
  "tailor_pickup_nudged",
  "tailor_marked_received",
  /** U039 — lent overdue enforce */
  "wardrobe_lent_nudged",
  "wardrobe_lent_lost",
  "wardrobe_lent",
  "wardrobe_lent_returned",
  /** U040 — photo-dump triage */
  "photo_dump_triaged",
  "photo_dump_triage_undone",
  /** Closet routes and screens that emitted names missing from this list. */
  "closet_profile_created",
  "closet_profile_wardrobe_viewed",
  "closet_profile_outfits_viewed",
  "wishlist_updated",
  "group_gift_contributed",
  "gift_budget_locked",
  "household_created",
  "household_joined",
  "household_wardrobe_patched",
  "household_vault_member_patched",
  "household_vault_spent",
  "ingestion_mute_rules_updated",
  "ingestion_merchant_aliased",
  "ingestion_raw_deleted",
  "wedding_festival_planned",
  "interview_kit_saved",
  "rto_address_fixed",
  "delivery_proof_attached",
  "return_pickup_rescheduled",
  "return_pickup_cancelled",
  "return_chase_snoozed",
  "return_chase_escalated",
  "return_window_corrected",
  "return_portal_field_copy",
  "wardrobe_repair_logged",
  "paywall_viewed",
  "paywall_upi_confirmed",
  "paywall_trial_started",
  "emi_from_sms_ui",
] as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export const AnalyticsEventNameSchema = z.enum(ANALYTICS_EVENTS);

export const RevealRatingSchema = z.enum(["loved", "ok", "meh"]);

export type RevealRating = z.infer<typeof RevealRatingSchema>;

export const RevealRatingBodySchema = z.object({
  rating: RevealRatingSchema,
});

export type RevealRatingBody = z.infer<typeof RevealRatingBodySchema>;

export const RevealRatingResponseSchema = z.object({
  orderId: z.string().uuid(),
  rating: RevealRatingSchema,
  recorded: z.literal(true),
});

export type RevealRatingResponse = z.infer<typeof RevealRatingResponseSchema>;

export type AnalyticsProperties = Record<
  string,
  string | number | boolean | null | undefined
>;

export type AnalyticsEvent = {
  name: AnalyticsEventName;
  properties?: AnalyticsProperties;
  timestamp?: string;
};

export type AnalyticsSink = (
  name: AnalyticsEventName,
  properties?: AnalyticsProperties,
) => void;

/**
 * Closet aha funnel — install → inbox/connect → found money → habit loop.
 * Preview/prod sinks should emit these when env is configured.
 */
export const CLOSET_FUNNEL_EVENTS = [
  "install",
  "ingestion_connected",
  "found_money_viewed",
  "time_to_found_money",
  "wear_logged",
  "outfit_viewed",
] as const satisfies readonly AnalyticsEventName[];

/**
 * Wave A WOW observability — skip paths, demo exit, empty CTAs, multi-add,
 * merchant return portal. Shared names so mobile + API sinks stay aligned.
 */
export const WAVE_A_WOW_EVENTS = [
  "demo_exited",
  "onboarding_skipped",
  "email_prompt_skipped",
  "empty_cta_tap",
  "add_another_tap",
  "return_portal_open",
] as const satisfies readonly AnalyticsEventName[];

const PII_KEY_RE =
  /^(email|e_mail|phone|mobile|msisdn|password|passwd|secret|token|access_token|refresh_token|authorization|auth|card|card_number|pan|cvv|ssn|aadhaar|address|full_name|firstname|lastname|first_name|last_name|otp)$/i;

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(?:\+\d[\d\s().-]{7,}\d)|(?:\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b)/;
const LONG_DIGIT_RE = /\b\d{12,19}\b/;

/**
 * Drop PII keys and redact emails / phones / long digit runs in string props.
 * Safe IDs (uuid-like accountId, userId opaque refs) are kept when the key is
 * allowlisted-style (not matching PII_KEY_RE).
 */
export function sanitizeAnalyticsProperties(
  properties?: AnalyticsProperties,
): AnalyticsProperties {
  if (!properties) return {};
  const out: AnalyticsProperties = {};
  for (const [key, value] of Object.entries(properties)) {
    if (PII_KEY_RE.test(key)) continue;
    if (typeof value === "string") {
      let scrubbed = value.replace(EMAIL_RE, "[redacted_email]");
      // Digit runs (PANs) before phone so 16-digit cards aren't phone-matched.
      scrubbed = scrubbed.replace(LONG_DIGIT_RE, "[redacted_digits]");
      scrubbed = scrubbed.replace(PHONE_RE, "[redacted_phone]");
      out[key] = scrubbed;
    } else {
      out[key] = value;
    }
  }
  return out;
}

export type HttpAnalyticsSinkOptions = {
  /** Generic webhook — POSTs `{ name, properties, timestamp }`. */
  webhookUrl?: string;
  /** PostHog project API key — POSTs to `/capture/`. */
  posthogKey?: string;
  /** Defaults to https://us.i.posthog.com */
  posthogHost?: string;
  distinctId?: string;
  fetchImpl?: typeof fetch;
};

/**
 * Thin HTTP analytics sink. Prefers ANALYTICS_WEBHOOK_URL-style webhook when
 * both are set; otherwise PostHog capture. Returns null when neither is
 * configured so callers keep their console/no-op default.
 * Always sanitizes properties (no PII) before send.
 */
export function createHttpAnalyticsSink(
  options: HttpAnalyticsSinkOptions,
): AnalyticsSink | null {
  const fetchFn =
    options.fetchImpl ??
    (typeof globalThis.fetch === "function"
      ? globalThis.fetch.bind(globalThis)
      : undefined);
  if (!fetchFn) return null;

  const webhookUrl = options.webhookUrl?.trim();
  const posthogKey = options.posthogKey?.trim();
  if (!webhookUrl && !posthogKey) return null;

  const distinctId = options.distinctId ?? "anonymous";

  return (name, properties) => {
    const timestamp = new Date().toISOString();
    const safeProps = sanitizeAnalyticsProperties(properties);
    const run = async () => {
      if (webhookUrl) {
        await fetchFn(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, properties: safeProps, timestamp }),
        });
        return;
      }
      const host = (options.posthogHost ?? "https://us.i.posthog.com").replace(
        /\/$/,
        "",
      );
      await fetchFn(`${host}/capture/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: posthogKey,
          event: name,
          distinct_id: distinctId,
          properties: { ...safeProps, distinct_id: distinctId },
          timestamp,
        }),
      });
    };
    void run().catch(() => {
      // best-effort — never break the product path
    });
  };
}
