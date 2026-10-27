# Gmail recorded fixtures (INGEST-GMAIL-E2E)

Captured Gmail API shapes used by `gmail-fixture-e2e.test.ts`. **Not** live OAuth.

| File | API / role |
|---|---|
| `profile.json` | `users.me.getProfile` (bootstrap `historyId`) |
| `messages-list.json` | `users.me.messages.list` (merchant query bootstrap; includes promo noise) |
| `history-incremental.json` | `users.me.history.list` (`messagesAdded` shape) |
| `history-empty.json` | `history.list` with empty `history[]` (cursor advance, zero msgs) |
| `history-legacy-messages.json` | `history.list` legacy `history[].messages` (not only `messagesAdded`) |
| `message-amazon.json` | `users.me.messages.get` — Amazon order (body base64url) |
| `message-flipkart.json` | `users.me.messages.get` — Flipkart order |
| `message-promo.json` | `users.me.messages.get` — non-candidate promo (filtered out) |

Residual live gap (real inbox + Google restricted-scope verification) is tracked in `docs/UNIVERSE_QA_REPORT.md` appendix **B4 / INGEST-GMAIL-E2E**. Do **not** check off `INGEST-GMAIL-E2E` on fixture-only green.
