/**
 * U007 — Detect EMI / BNPL due signals from SMS (or email) bodies.
 * Re-exports shared detector so worker fixtures stay Closet-aligned.
 */
export {
  detectEmiSignal,
  type ParsedEmiSignal,
} from "@worn/shared";
