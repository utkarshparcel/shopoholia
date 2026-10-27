/**
 * Hard-delete typed confirm (W078-DELETE-CONFIRM-POLISH).
 * Accepts the literal DELETE or the account email so accidental taps cannot wipe data.
 */

export const DELETE_CONFIRM_PHRASE = 'DELETE' as const;

export const DELETE_CONFIRM_HINT =
  'Type DELETE or your account email to permanently erase your Vault.';

export function normalizeDeleteConfirmInput(raw: string): string {
  return raw.trim();
}

/**
 * True when the typed value matches DELETE (case-insensitive) or the session email
 * (case-insensitive). Empty email is ignored — only DELETE works then.
 */
export function isDeleteConfirmValid(
  input: string,
  email: string | null | undefined,
): boolean {
  const typed = normalizeDeleteConfirmInput(input);
  if (!typed) return false;
  if (typed.toUpperCase() === DELETE_CONFIRM_PHRASE) return true;
  const account = email?.trim();
  if (account && typed.toLowerCase() === account.toLowerCase()) return true;
  return false;
}
