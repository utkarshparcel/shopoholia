# Playbook: Merchant parser breakage

**When:** Ingestion shows wrong merchant, amount, order ref, or status `UNMATCHED` / `ERROR`; user reports “vault number is wrong” after email/SMS/receipt sync.

**Severity**

| Level | Example | SLA (ack → first action) |
|-------|---------|---------------------------|
| P0 | Systematic wrong balances across many users / one major merchant | 4h |
| P1 | Single-user wrong money after sync | 1 business day |
| P2 | Cosmetic / unmatched with no money impact | 3 business days |

## Triage

1. **Confirm source** — Vault → Metrics / “What we read” (`GET /ingestion/activity`). Note `kind` (EMAIL / SMS / RECEIPT), `status`, doc id, purchase id if matched.
2. **Do not ask for passwords or full card PINs.** Prefer in-app correct flow or redacted screenshots.
3. **User self-serve first** — `POST /ingestion/documents/:id/correct` (mobile Fix UI) patches purchase + audit. Prefer this over silent admin edits.
4. **Money drift** — If ledger ≠ cached balance: `GET /admin/money/reconcile?fix=false` (dry-run), then `fix=true` only with dual review for P0.

## Fix paths

| Symptom | Action |
|---------|--------|
| One bad parse | User/correct endpoint; verify vault total |
| Merchant template drift (site changed email HTML) | File parser spike / fixture in `worker-ingest`; track accuracy gate (`pnpm --filter @worn/worker-ingest spike:check`) |
| Source token revoked / sync stopped | Consent center → reconnect; check Limited Use copy still accurate (`docs/CASA.md`) |
| Raw blob already purged (retention TTL) | Explain EMAIL 7d / SMS 14d / RECEIPT 30d; re-sync or manual capture (`POST /credits/capture`) |

## Guardrails

- Never widen Gmail scopes to “fix” parsing.
- Never post raw inbox content in Slack/Discord support threads.
- Audit: corrections and reconciles must leave an audit trail (`audit` + `parser_feedback` events).

## Done when

- User vault total matches expected (or dispute escalated to refund playbook).
- If merchant-wide: fixture + regression test added or ticket filed with merchant id + sample redacted headers.
- Support note links doc id(s) and whether reconcile ran.
