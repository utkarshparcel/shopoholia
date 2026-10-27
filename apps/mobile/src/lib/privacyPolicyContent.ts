/**
 * In-app privacy policy body (W081-PRIVACY-IN-APP).
 * Condensed from docs/legal/PRIVACY_POLICY_DRAFT.md — draft, not counsel-signed (legal review is
 * still owed before launch; the screen no longer shows developer notes about it).
 * Readable without App Store / Play submit; no external fetch required.
 */

export const PRIVACY_POLICY_IN_APP_TITLE = 'Privacy policy';

export const PRIVACY_POLICY_BANNER =
  'A short version of how WORN handles your data. The full policy is on the web.';

/** Section blocks shown in the in-app reader ScrollView. */
export const PRIVACY_POLICY_SECTIONS: ReadonlyArray<{
  heading: string;
  body: string;
}> = [
  {
    heading: 'Who we are',
    body: 'WORN Closet helps you find money you already paid for (gift cards, store credit, returns, warranties) and manage your wardrobe. Privacy contact: privacy@worn.app.',
  },
  {
    heading: 'What we collect',
    body: 'Account details, vault balances, purchase/return summaries, receipt photos, wardrobe data you add, optional Gmail sync status, push tokens you allow, and scrubbed diagnostics. We do not sell your personal data. We do not use Gmail content for ads or to train general AI/ML models.',
  },
  {
    heading: 'How we use data',
    body: 'Surface found money and deadlines, send reminders you enable, improve parsers for your benefit, and meet security/legal obligations. Consent can be withdrawn anytime in Consent or by deleting your account.',
  },
  {
    heading: 'Retention',
    body: 'Raw ingestion blobs are deleted after parse: email receipts in 7 days, order texts in 14 days, uploaded photo receipts in 30 days. Vault summaries remain until you export or delete your account.',
  },
  {
    heading: 'Your rights',
    body: 'Export your data, permanently delete your account, disconnect sources, and correct balances from Vault / Consent. Depending on where you live, DPDP (India) or GDPR (EU/UK) rights also apply.',
  },
  {
    heading: 'Security',
    body: 'HTTPS in transit. OAuth tokens encrypted at rest when Gmail is connected. Signed-URL object access where configured. Rate limits on sensitive vault routes.',
  },
] as const;

/**
 * Every outside service the code sends user data to, and what it gets (Plan #13). Keep this in step
 * with the API: a new provider call is not shipped until it is listed here. Razorpay is not listed
 * because the payments adapter never calls it (UPI is a stub deep link).
 */
export const PRIVACY_POLICY_SUBPROCESSORS: ReadonlyArray<{ name: string; receives: string }> = [
  {
    name: 'Cloudflare R2',
    receives: 'Stores the photos you add (clothes, receipts, try-on photos) and files you export.',
  },
  {
    name: 'FASHN',
    receives: 'Your photo and the garment image, only when you start a try-on, to make the try-on image.',
  },
  {
    name: 'Google sign-in',
    receives: 'Your Google account name and email address when you sign in with Google.',
  },
  {
    name: 'Google Gmail API',
    receives: 'Read-only access to order, return and receipt emails, only if you connect Gmail.',
  },
  {
    name: 'Google Cloud Vision',
    receives: 'Receipt photos you upload, to read the text on them, when receipt reading is switched on.',
  },
  {
    name: 'Clothing tagging service',
    receives: 'Photos of clothes you add, to suggest a category and colours.',
  },
  {
    name: 'Weather service',
    receives: 'An approximate location for outfit ideas. No account details.',
  },
  {
    name: 'Expo push service',
    receives: "Your device's push token and the text of reminders you turned on.",
  },
  {
    name: 'Sentry',
    receives: 'Crash and error reports: app version, device type and the screen or request that failed.',
  },
  {
    name: 'PostHog',
    receives: 'Which screens and buttons you use, linked to your account ID. No balances, emails or photos.',
  },
  {
    name: 'Apple (App Store)',
    receives: 'Purchase records for coins you buy in the app. Nothing else.',
  },
  {
    name: 'Google (Play Billing and the Play Developer API)',
    receives: 'Purchase records for coins you buy in the app. Nothing else.',
  },
] as const;

export function getPrivacyPolicyInAppDocument(): {
  title: string;
  banner: string;
  sections: typeof PRIVACY_POLICY_SECTIONS;
  subprocessors: typeof PRIVACY_POLICY_SUBPROCESSORS;
  lastUpdated: string;
} {
  return {
    title: PRIVACY_POLICY_IN_APP_TITLE,
    banner: PRIVACY_POLICY_BANNER,
    sections: PRIVACY_POLICY_SECTIONS,
    subprocessors: PRIVACY_POLICY_SUBPROCESSORS,
    lastUpdated: '2026-10-27',
  };
}
