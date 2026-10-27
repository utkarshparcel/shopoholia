import { createMemoryRepositories } from "./lib/repositories/memory.js";
import { buildServer } from "./index.js";

export async function buildTestServer() {
  const repos = createMemoryRepositories();
  const app = await buildServer({ logger: false, deps: { repos } });
  return { app, repos };
}

export async function login(
  app: Awaited<ReturnType<typeof buildServer>>,
  phone = "919876543210",
): Promise<{ accessToken: string; userId: string }> {
  await app.inject({ method: "POST", url: "/auth/otp", payload: { phone } });
  const verify = await app.inject({
    method: "POST",
    url: "/auth/verify",
    payload: { phone, otp: "123456" },
  });
  const body = verify.json() as { accessToken: string };
  const decoded = app.jwt.verify(body.accessToken) as { sub: string };
  return { accessToken: body.accessToken, userId: decoded.sub };
}
