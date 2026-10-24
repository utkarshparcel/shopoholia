type Env = Record<string, string | undefined>;

const DEV_JWT_SECRET = "dev-only-change-me";

/**
 * Secret for signing access tokens. JWT_ACCESS_SECRET is the documented name
 * (.env.example, @worn/config); JWT_SECRET is still read so existing setups keep working.
 */
export function resolveJwtSecret(env: Env = process.env): { secret: string; warning?: string } {
  const secret = env.JWT_ACCESS_SECRET || env.JWT_SECRET;
  if (secret) return { secret };

  if (env.NODE_ENV === "production") {
    throw new Error("JWT_ACCESS_SECRET must be set in production");
  }
  return {
    secret: DEV_JWT_SECRET,
    warning: "JWT_ACCESS_SECRET not set — using dev fallback. Do not deploy.",
  };
}

/** PORT/HOST (set by most hosting platforms) win over the documented API_PORT/API_HOST. */
export function resolveListenAddress(env: Env = process.env): { port: number; host: string } {
  return {
    port: Number(env.PORT || env.API_PORT || 3000),
    host: env.HOST || env.API_HOST || "0.0.0.0",
  };
}
