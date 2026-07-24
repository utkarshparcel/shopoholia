import { z } from "zod";

/** Shared runtime environment fields */
const baseEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
});

/** API + worker services */
export const serverEnvSchema = baseEnvSchema.extend({
  DATABASE_URL: z
    .string()
    .url()
    .describe("PostgreSQL connection string"),
  REDIS_URL: z
    .string()
    .url()
    .describe("Redis connection string (BullMQ + cache)"),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  API_PORT: z.coerce.number().int().positive().default(3000),
  API_HOST: z.string().default("0.0.0.0"),
  CORS_ORIGIN: z.string().default("*"),
  // Cloudflare R2 (optional until storage is wired)
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  R2_PUBLIC_URL: z.string().url().optional(),
  // OTP providers (optional in local dev)
  MSG91_AUTH_KEY: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  // Render providers (optional until Week 2 spike)
  FASHN_API_KEY: z.string().optional(),
  COMFYUI_BASE_URL: z.string().url().optional(),
  // Observability (optional — no-op without DSN)
  SENTRY_DSN: z.string().url().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Local development defaults matching infra/docker-compose.yml */
export const localDevDefaults = {
  DATABASE_URL: "postgresql://worn:worn@localhost:5432/worn",
  REDIS_URL: "redis://localhost:6379",
  JWT_ACCESS_SECRET: "dev-access-secret-change-me-32chars!!",
  JWT_REFRESH_SECRET: "dev-refresh-secret-change-me-32chars!",
} as const satisfies Partial<ServerEnv>;

export function parseServerEnv(
  env: Record<string, string | undefined> = process.env,
): ServerEnv {
  return serverEnvSchema.parse(env);
}

export function parseServerEnvSafe(
  env: Record<string, string | undefined> = process.env,
) {
  return serverEnvSchema.safeParse(env);
}
