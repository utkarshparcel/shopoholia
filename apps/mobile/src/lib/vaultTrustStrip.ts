/**
 * W014 — Persistent trust strip copy + link targets for vault chrome.
 */

export type VaultTrustStripLinkId = 'readonly' | 'revoke' | 'export_delete';

export type VaultTrustStripLink = {
  id: VaultTrustStripLinkId;
  label: string;
  /** Expo-router path under Closet. */
  href: '/(closet)/consent' | '/(closet)/vault';
  /** Anchor hint for consent / privacy actions. */
  focus?: 'revoke' | 'export';
};

export const VAULT_TRUST_STRIP_LABEL =
  'Read-only access · Revoke anytime · Export or delete your data';

export function getVaultTrustStripLinks(): VaultTrustStripLink[] {
  return [
    {
      id: 'readonly',
      label: 'Read-only',
      href: '/(closet)/consent',
    },
    {
      id: 'revoke',
      label: 'Revoke',
      href: '/(closet)/consent',
      focus: 'revoke',
    },
    {
      id: 'export_delete',
      label: 'Export / Delete',
      href: '/(closet)/consent',
      focus: 'export',
    },
  ];
}

export function assertsTrustStripCoversControls(copy: string): boolean {
  const lower = copy.toLowerCase();
  return (
    (lower.includes('read-only') || lower.includes('readonly')) &&
    lower.includes('revoke') &&
    (lower.includes('export') || lower.includes('delete'))
  );
}
