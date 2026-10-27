# Ops playbooks (OPS-PLAYBOOKS)

Support runbooks when money or data is wrong. Linked from admin: `GET /admin/ops/playbooks` (requires JWT + `X-Admin-Secret`).

| ID | Playbook | Path |
|----|----------|------|
| `parser-breakage` | Merchant parser breakage | [parser-breakage.md](parser-breakage.md) |
| `refund-disputes` | Refund disputes | [refund-disputes.md](refund-disputes.md) |
| `data-deletion` | Data-deletion requests / SLAs | [data-deletion.md](data-deletion.md) |

Related admin tools: `GET /admin/money/reconcile`, `POST /admin/ingestion/retention/purge`.
