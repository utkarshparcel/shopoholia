import { describe, expect, it } from 'vitest';

import { CONSENT_FALLBACK_RETURN, consentHref, consentReturnHref } from './consentReturn';

describe('consentReturnHref', () => {
  it('accepts Closet screens, with or without the route group', () => {
    expect(consentReturnHref('/(closet)/onboarding')).toBe('/(closet)/onboarding');
    expect(consentReturnHref('/accountant')).toBe('/(closet)/accountant');
    expect(consentReturnHref(['/(closet)/connect-email'])).toBe('/(closet)/connect-email');
  });

  it('falls back to the Vault for anything else', () => {
    for (const raw of [
      undefined,
      '',
      '/consent',
      '/(closet)/consent',
      '/(tabs)/feed',
      'https://evil.example/',
      '//evil.example',
      '/(closet)/vault?x=1',
      42,
    ]) {
      expect(consentReturnHref(raw)).toBe(CONSENT_FALLBACK_RETURN);
    }
  });

  it('builds a consent route that carries returnTo and any extra params', () => {
    expect(consentHref('/(closet)/onboarding')).toEqual({
      pathname: '/(closet)/consent',
      params: { returnTo: '/(closet)/onboarding' },
    });
    expect(consentHref(undefined, { focus: 'revoke' }).params).toEqual({
      focus: 'revoke',
      returnTo: '/(closet)/vault',
    });
  });
});
