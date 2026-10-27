export type GoogleIdTokenPayload = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  aud: string;
};

const GOOGLE_TOKENINFO_TIMEOUT_MS = 5_000;

/** Google couldn't be reached (timeout, network error or a 5xx), so the token wasn't checked. */
export class GoogleVerifyUnavailableError extends Error {
  constructor(cause: unknown) {
    super("Google Sign-In could not be verified right now", { cause });
  }
}

function googleClientAudiences(): string[] {
  const raw =
    process.env.GOOGLE_CLIENT_IDS ??
    process.env.GOOGLE_CLIENT_ID ??
    "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Verifies a Google ID token via Google's tokeninfo endpoint.
 * Free — no SMS. Configure GOOGLE_CLIENT_IDS (comma-separated web/ios/android client IDs).
 */
export async function verifyGoogleIdToken(
  idToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleIdTokenPayload | null> {
  const audiences = googleClientAudiences();
  if (audiences.length === 0) {
    if (process.env.NODE_ENV === "test") {
      return verifyTestGoogleToken(idToken);
    }
    return null;
  }

  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
  let res: Response;
  try {
    res = await fetchImpl(url, { signal: AbortSignal.timeout(GOOGLE_TOKENINFO_TIMEOUT_MS) });
  } catch (error) {
    throw new GoogleVerifyUnavailableError(error);
  }
  if (res.status >= 500) throw new GoogleVerifyUnavailableError(`tokeninfo ${res.status}`);
  if (!res.ok) return null;

  const data = (await res.json()) as {
    sub?: string;
    email?: string;
    email_verified?: string | boolean;
    name?: string;
    aud?: string;
    iss?: string;
  };

  if (!data.sub || !data.email || !data.aud) return null;
  if (!audiences.includes(data.aud)) return null;
  if (data.iss !== "accounts.google.com" && data.iss !== "https://accounts.google.com") {
    return null;
  }

  const emailVerified = data.email_verified === true || data.email_verified === "true";
  if (!emailVerified) return null;

  return {
    sub: data.sub,
    email: data.email,
    emailVerified,
    name: data.name ?? null,
    aud: data.aud,
  };
}

/** Deterministic fake tokens for unit tests: `test-google:<sub>:<email>` */
export function verifyTestGoogleToken(idToken: string): GoogleIdTokenPayload | null {
  if (!idToken.startsWith("test-google:")) return null;
  const [, sub, email, name] = idToken.split(":");
  if (!sub || !email) return null;
  return {
    sub,
    email,
    emailVerified: true,
    name: name ?? null,
    aud: "test-client",
  };
}
