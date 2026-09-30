import type { Repositories } from "../repositories/types.js";
import { deepLinkForPushEvent, pushDedupeKey, type PushService } from "./stub.js";

export const EXPO_PUSH_SEND_URL = "https://exp.host/--/api/v2/push/send";

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  sound: "default";
  data: Record<string, unknown>;
};

/** https://docs.expo.dev/push-notifications/sending-notifications/#push-ticket-format */
type ExpoPushTicket = {
  status?: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
};

type ExpoPushResponse = {
  // One ticket when a single message is sent, an array when an array is sent.
  data?: ExpoPushTicket | ExpoPushTicket[];
  errors?: Array<{ code?: string; message?: string }>;
};

type ExpoSendResult =
  | { ok: true; ticketId: string }
  | { ok: false; error: string; deviceNotRegistered: boolean };

export type ExpoPushServiceOptions = {
  repos: Repositories;
  /** EXPO_ACCESS_TOKEN: only needed once "enhanced push security" is on for the Expo project. */
  accessToken?: string;
  fetch?: typeof fetch;
  url?: string;
  /** Caps how long a slow Expo response can hold up the order step that sent the push. */
  timeoutMs?: number;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function createExpoPushService(options: ExpoPushServiceOptions): PushService {
  const { repos } = options;
  const url = options.url ?? EXPO_PUSH_SEND_URL;
  const timeoutMs = options.timeoutMs ?? 10_000;

  async function sendToExpo(message: ExpoPushMessage): Promise<ExpoSendResult> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`;

    let response: Response;
    try {
      response = await (options.fetch ?? fetch)(url, {
        method: "POST",
        headers,
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      return { ok: false, error: `request failed: ${errorMessage(error)}`, deviceNotRegistered: false };
    }

    const body = (await response.json().catch(() => null)) as ExpoPushResponse | null;
    const requestError = body?.errors?.[0];
    if (!response.ok || requestError) {
      const detail = [requestError?.code, requestError?.message].filter(Boolean).join(": ");
      return {
        ok: false,
        error: `HTTP ${response.status}${detail ? ` ${detail}` : ""}`,
        deviceNotRegistered: false,
      };
    }

    const ticket = Array.isArray(body?.data) ? body.data[0] : body?.data;
    if (ticket?.status === "ok" && ticket.id) return { ok: true, ticketId: ticket.id };

    const code = ticket?.details?.error;
    return {
      ok: false,
      error: [code, ticket?.message].filter(Boolean).join(": ") || "no push ticket in response",
      deviceNotRegistered: code === "DeviceNotRegistered",
    };
  }

  return {
    async send(payload) {
      try {
        const link = deepLinkForPushEvent(payload.eventType, payload.orderId);
        const { event, created } = await repos.recordPushEventIfNew({
          userId: payload.userId,
          orderId: payload.orderId,
          eventType: payload.eventType,
          title: payload.title,
          body: payload.body,
          dedupeKey: pushDedupeKey(payload.orderId, payload.eventType),
          payload: link,
          status: "QUEUED",
        });
        // A repeated order step: whoever recorded the event first sent it.
        if (!created) return;

        // No registered device: the QUEUED row is the only record of the update.
        const token = (await repos.findUserById(payload.userId))?.pushToken;
        if (!token) return;

        const result = await sendToExpo({
          to: token,
          title: payload.title,
          body: payload.body,
          sound: "default",
          data: link,
        });
        if (result.ok) {
          await repos.updatePushEvent(event.id, { status: "SENT", expoTicketId: result.ticketId });
          return;
        }

        console.warn("[push] Expo rejected", payload.eventType, payload.orderId, result.error);
        await repos.updatePushEvent(event.id, { status: "FAILED" });
        if (result.deviceNotRegistered) {
          // Uninstalled or notifications turned off: stop sending until the app registers again.
          await repos.clearPushToken(payload.userId, token);
        }
      } catch (error) {
        // Order steps must not fail because a notification couldn't be sent.
        console.error("[push] send failed", payload.eventType, payload.orderId, error);
      }
    },
    async listEvents(userId) {
      return repos.listPushEvents(userId);
    },
  };
}
