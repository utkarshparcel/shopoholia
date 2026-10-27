# Playbook: Refund disputes

**When:** User says a return was refunded by the merchant but WORN still shows open / wrong amount; or WORN shows `REFUNDED` but bank/UPI doesn’t match.

**Context:** Closet mirrors returns + optional ledger credit (`POST /returns/:id/refund`, board `GET /returns/refund-eta`). WORN is **not** the merchant of record — we reconcile the user’s vault, we do not move bank money.

## Severity

| Level | Example | SLA |
|-------|---------|-----|
| P0 | Double-counted refund in vault / negative trust (“stolen money” narrative) | 4h |
| P1 | Single return stuck pre-`REFUNDED` after merchant paid | 1 business day |
| P2 | ETA board confusion only | 3 business days |

## Triage

1. Pull return id, state machine history, `refundMinor`, linked purchase/order.
2. Ask for **merchant refund SMS/email date + amount** (redact account numbers).
3. Check refund-ETA board: is state `INITIATED`…`CONFIRMED` vs `REFUNDED`?
4. Check money ledger for duplicate `refund` / credit rows for same return.

## Fix paths

| Situation | Action |
|-----------|--------|
| Merchant refunded; Closet not marked | User or support marks refund via `POST /returns/:id/refund` with correct `refundMinor` once CONFIRMED |
| Wrong amount posted | Correct via returns + money reconcile dry-run; never invent bank truth |
| User disputes merchant (RTO / partial) | Document; Closet cannot force merchant — point to merchant support; keep vault notes accurate |
| Ledger drift after mark | `GET /admin/money/reconcile?fix=false` then fix with review |

## Scripts / macros (support reply)

> WORN tracks your return window and records when you mark a refund. We don’t hold or send the merchant’s money. If the brand already paid you, mark the return Refunded in Closet (or reply with the refund amount and date and we’ll help align the vault). Export is always available under Vault.

## Done when

- Return state and ledger match the user’s confirmed merchant outcome **or** explicitly marked disputed with notes.
- No duplicate refund ledger lines.
- User offered export if they need a record for chargebacks.
