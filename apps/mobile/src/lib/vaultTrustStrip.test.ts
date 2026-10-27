import { describe, expect, it } from 'vitest';

import {
  VAULT_TRUST_STRIP_LABEL,
  assertsTrustStripCoversControls,
  getVaultTrustStripLinks,
} from './vaultTrustStrip';

describe('vaultTrustStrip (W014)', () => {
  it('covers read-only, revoke, and export/delete', () => {
    expect(assertsTrustStripCoversControls(VAULT_TRUST_STRIP_LABEL)).toBe(true);
    const links = getVaultTrustStripLinks();
    expect(links.map((l) => l.id)).toEqual(['readonly', 'revoke', 'export_delete']);
    expect(links.find((l) => l.id === 'revoke')?.href).toContain('consent');
    expect(links.find((l) => l.id === 'export_delete')?.focus).toBe('export');
  });
});
