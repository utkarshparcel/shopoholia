// Lives in @worn/shared so the API worker can decrypt the same tokens (gmail-token-revoke).
export { decryptToken, encryptToken } from "@worn/shared/token-crypto";
