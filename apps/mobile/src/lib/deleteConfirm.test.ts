import { describe, expect, it } from 'vitest';

import {
  DELETE_CONFIRM_HINT,
  DELETE_CONFIRM_PHRASE,
  isDeleteConfirmValid,
  normalizeDeleteConfirmInput,
} from './deleteConfirm';

describe('deleteConfirm (W078-DELETE-CONFIRM-POLISH)', () => {
  it('accepts DELETE case-insensitively', () => {
    expect(isDeleteConfirmValid('DELETE', null)).toBe(true);
    expect(isDeleteConfirmValid('delete', null)).toBe(true);
    expect(isDeleteConfirmValid('  DeLeTe  ', null)).toBe(true);
  });

  it('accepts account email case-insensitively', () => {
    expect(isDeleteConfirmValid('user@worn.app', 'user@worn.app')).toBe(true);
    expect(isDeleteConfirmValid('User@Worn.App', 'user@worn.app')).toBe(true);
  });

  it('rejects typos and empty input', () => {
    expect(isDeleteConfirmValid('', 'a@b.c')).toBe(false);
    expect(isDeleteConfirmValid('DELET', null)).toBe(false);
    expect(isDeleteConfirmValid('other@worn.app', 'user@worn.app')).toBe(false);
  });

  it('ignores blank email — only DELETE works', () => {
    expect(isDeleteConfirmValid('user@worn.app', null)).toBe(false);
    expect(isDeleteConfirmValid('user@worn.app', '  ')).toBe(false);
    expect(isDeleteConfirmValid(DELETE_CONFIRM_PHRASE, '')).toBe(true);
  });

  it('exposes confirm hint for UI', () => {
    expect(normalizeDeleteConfirmInput('  DELETE  ')).toBe('DELETE');
    expect(DELETE_CONFIRM_HINT).toMatch(/DELETE|email/i);
  });
});
