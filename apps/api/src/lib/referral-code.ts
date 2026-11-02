import { randomBytes } from "node:crypto";

/** No 0/O or 1/I: codes are read aloud and typed in. 32 letters, so a byte maps without bias. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const REFERRAL_CODE_LENGTH = 6;
/** Fresh codes tried before giving up; with ~1e9 codes a second collision in a row is very unlikely. */
export const REFERRAL_CODE_ATTEMPTS = 5;

/** A random referral code: six characters from the unambiguous alphabet. */
export function newReferralCode(): string {
  const bytes = randomBytes(REFERRAL_CODE_LENGTH);
  let code = "";
  for (const byte of bytes) code += ALPHABET[byte % ALPHABET.length]!;
  return code;
}

/** A unique violation on users.referral_code (postgres-js, possibly wrapped in `cause`). */
export function isReferralCodeCollision(error: unknown): boolean {
  for (let e: unknown = error, depth = 0; e && depth < 3; depth++) {
    const err = e as { code?: unknown; constraint_name?: unknown; message?: unknown };
    if (err.code === "23505") {
      const where = typeof err.constraint_name === "string" ? err.constraint_name : String(err.message ?? "");
      return where.includes("referral_code");
    }
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Runs `write` with a new random referral code, and again with another one while the code turns
 * out to be taken (unique violation on referral_code). Other errors are thrown as they are.
 */
export async function withNewReferralCode<T>(
  write: (code: string) => Promise<T>,
  generate: () => string = newReferralCode,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await write(generate());
    } catch (error) {
      if (attempt >= REFERRAL_CODE_ATTEMPTS || !isReferralCodeCollision(error)) throw error;
    }
  }
}
