import type { RawEmailMessage } from "../parsers/types.js";

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  /** Expiry as epoch milliseconds. */
  expiresAt?: number;
  scope?: string;
}

/** A consent grant the connector must consult before reading any mail. */
export interface ConsentGrant {
  id: string;
  revokedAt: Date | null;
}

/** Encrypted-token persistence. In production this is backed by the
 * `ingestion_sources.encrypted_token` column; tests use an in-memory variant. */
export interface TokenStore {
  load(): Promise<string | null>;
  save(encrypted: string): Promise<void>;
}

export class ConsentRequiredError extends Error {
  constructor(message = "Active consent grant required before reading email") {
    super(message);
    this.name = "ConsentRequiredError";
  }
}

export interface EmailConnector {
  readonly id: string;
  /** Build the provider OAuth consent URL for the given opaque state. */
  buildOAuthUrl(state: string): string;
  /** Exchange an OAuth `code` for tokens, encrypting + persisting them. */
  completeOAuth(code: string, consent: ConsentGrant): Promise<OAuthTokens>;
  /** List normalized messages since the `cursor` (Gmail historyId), refusing
   * to read without a live consent grant. */
  listSince(
    cursor: string | null,
    consent: ConsentGrant,
  ): Promise<{ messages: RawEmailMessage[]; nextCursor: string }>;
}
