/**
 * In-app privacy policy body (W081-PRIVACY-IN-APP).
 * Condensed from docs/legal/PRIVACY_POLICY_DRAFT.md — draft, not counsel-signed.
 * Readable without App Store / Play submit; no external fetch required.
 */

export const PRIVACY_POLICY_IN_APP_TITLE = 'Privacy policy';

export const PRIVACY_POLICY_DRAFT_BANNER =
  'Draft for in-app reading. Not legal advice and not a published counsel-signed policy.';

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
    body: 'Account details, vault balances, purchase/return summaries, receipt photos, wardrobe data you add, optional Gmail/SMS sync status, push tokens you allow, and scrubbed diagnostics. We do not sell your personal data. We do not use Gmail content for ads or to train general AI/ML models.',
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

export function getPrivacyPolicyInAppDocument(): {
  title: string;
  banner: string;
  sections: typeof PRIVACY_POLICY_SECTIONS;
  lastUpdated: string;
} {
  return {
    title: PRIVACY_POLICY_IN_APP_TITLE,
    banner: PRIVACY_POLICY_DRAFT_BANNER,
    sections: PRIVACY_POLICY_SECTIONS,
    lastUpdated: '2026-08-26',
  };
}
