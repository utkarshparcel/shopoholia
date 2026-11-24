import pino from "pino";
import { describe, expect, it } from "vitest";
import { buildServer } from "./index.js";

describe("request log", () => {
  it("never records query strings (the Gmail OAuth callback carries the code and state)", async () => {
    const app = await buildServer({ logger: true });
    try {
      const serializers = (app.log as unknown as Record<symbol, Record<string, (value: unknown) => unknown>>)[
        pino.symbols.serializersSym
      ]!;
      const logged = serializers.req!({
        method: "GET",
        url: "/ingestion/sources/oauth/callback?code=4/0AQSecret&state=signed.state",
        host: "api.worncloset.app",
        ip: "203.0.113.9",
        socket: { remotePort: 443 },
      }) as { url: string };
      expect(logged.url).toBe("/ingestion/sources/oauth/callback");
      expect(JSON.stringify(logged)).not.toMatch(/code=|state=|4\/0AQSecret/);
    } finally {
      await app.close();
    }
  });
});
