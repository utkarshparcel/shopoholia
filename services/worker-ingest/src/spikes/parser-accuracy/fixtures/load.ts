import type { RawEmailMessage } from "../../../parsers/types.js";

/** Minimal RFC822-ish .eml parser for the spike fixtures. Real inbound mail
 * can be dropped in as `.eml` files and parsed the same way. Folded headers
 * are not handled — keep fixture headers single-line. */
export function parseEml(raw: string, fallbackId: string): RawEmailMessage {
  const lines = raw.split(/\r?\n/);
  const headers: Record<string, string> = {};
  let bodyStart = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      bodyStart = i + 1;
      break;
    }
    const m = line.match(/^([A-Za-z-]+):\s*(.*)$/);
    if (m) headers[m[1]?.toLowerCase() ?? ""] = m[2] ?? "";
  }

  const text = lines.slice(bodyStart).join("\n").trim();
  const receivedAt = headers["date"]
    ? new Date(headers["date"]).toISOString()
    : new Date(0).toISOString();

  return {
    messageId: headers["message-id"] ?? fallbackId,
    from: headers["from"] ?? "unknown@unknown",
    to: headers["to"] ?? "unknown@unknown",
    subject: headers["subject"] ?? "",
    text,
    receivedAt,
  };
}
