import { describe, expect, it } from "vitest";
import { mapAccountHealth } from "./account-health.js";

describe("mapAccountHealth status mapping", () => {
  it("maps IDLE + token + lastSync as healthy", () => {
    expect(
      mapAccountHealth({
        status: "IDLE",
        lastSyncAt: "2026-08-26T08:00:00.000Z",
        hasToken: true,
      }),
    ).toEqual({
      tone: "ok",
      label: "Healthy",
      status: "IDLE",
      lastSyncAt: "2026-08-26T08:00:00.000Z",
      error: null,
      needsReconnect: false,
      hasToken: true,
    });
  });

  it("maps IDLE waiting for first sync", () => {
    const h = mapAccountHealth({
      status: "IDLE",
      lastSyncAt: null,
      hasToken: true,
    });
    expect(h.tone).toBe("ok");
    expect(h.label).toContain("waiting");
    expect(h.needsReconnect).toBe(false);
  });

  it("maps SYNCING and PAUSED without reconnect", () => {
    expect(
      mapAccountHealth({
        status: "SYNCING",
        lastSyncAt: null,
        hasToken: true,
      }).tone,
    ).toBe("syncing");
    expect(
      mapAccountHealth({
        status: "PAUSED",
        lastSyncAt: "2026-08-26T08:00:00.000Z",
        hasToken: true,
      }),
    ).toMatchObject({
      tone: "paused",
      label: "Paused",
      needsReconnect: false,
      error: null,
    });
  });

  it("maps ERROR to needs_reconnect with default error copy", () => {
    expect(
      mapAccountHealth({
        status: "ERROR",
        lastSyncAt: "2026-08-20T08:00:00.000Z",
        hasToken: false,
      }),
    ).toMatchObject({
      tone: "needs_reconnect",
      label: "Reconnect needed",
      needsReconnect: true,
      error: "No access token — reconnect required",
      hasToken: false,
    });
  });

  it("prefers meta.lastError and reconnect error codes", () => {
    expect(
      mapAccountHealth({
        status: "ERROR",
        lastSyncAt: null,
        hasToken: false,
        meta: {
          lastError: "Disconnected — reconnect to resume sync",
          errorCode: "DISCONNECTED",
        },
      }),
    ).toMatchObject({
      tone: "needs_reconnect",
      needsReconnect: true,
      error: "Disconnected — reconnect to resume sync",
    });

    expect(
      mapAccountHealth({
        status: "IDLE",
        lastSyncAt: "2026-08-26T08:00:00.000Z",
        hasToken: true,
        meta: { errorCode: "TOKEN_REVOKED", lastError: "Gmail revoked access" },
      }).needsReconnect,
    ).toBe(true);
  });

  it("treats missing token on IDLE as reconnect needed", () => {
    const h = mapAccountHealth({
      status: "IDLE",
      lastSyncAt: null,
      hasToken: false,
    });
    expect(h.tone).toBe("needs_reconnect");
    expect(h.needsReconnect).toBe(true);
    expect(h.error).toMatch(/token/i);
  });

  it("coerces unknown status to ERROR reconnect", () => {
    expect(
      mapAccountHealth({
        status: "WEIRD",
        lastSyncAt: null,
        hasToken: true,
      }).status,
    ).toBe("ERROR");
  });
});
