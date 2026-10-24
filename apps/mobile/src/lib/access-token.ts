/** The user id (JWT `sub`) in an access token, or null when there's none to read. */
export function userIdFromAccessToken(token: string | null): string | null {
  const payload = token?.split('.')[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))) as {
      sub?: unknown;
    } | null;
    return typeof claims?.sub === 'string' && claims.sub ? claims.sub : null;
  } catch {
    return null;
  }
}
