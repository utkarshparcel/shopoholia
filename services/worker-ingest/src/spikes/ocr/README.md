# OCR Spike: Hosted vs On-Device

**Status:** OPEN — default path is the deterministic `MockOcrClient`.

## The decision

When a user uploads a receipt photo, we need to turn the image into structured
fields (`merchant`, `totalMinor`, per-line `items`). Two ways to do that:

### Hosted OCR (cloud vision API)
- **Pros:** high quality on messy / folded / low-light scans, no on-device ML
  weight, fast to integrate, model improvements are push-button.
- **Cons:** cost per page (API call + egress), latency (upload + round trip),
  and **PII egress** — receipts are financial documents, so sending raw images
  off-device needs the `FINANCIAL` consent scope we already gate on, plus a
  DPA with the provider.

### On-device / upload-worker OCR (local model)
- **Pros:** no image egress (privacy win — receipt never leaves our boundary),
  near-zero marginal cost at scale, works offline.
- **Cons:** heavier compute on the worker/device, variable quality, we own the
  model lifecycle and accuracy regression testing.

## Current chosen default

`OCR_PROVIDER=mock` → `MockOcrClient` (apps/api/src/lib/ocr/mock.ts). It returns
a deterministic fixture so the entire receipt → `merchant_purchases` →
`warranties` → reminder pipeline is exercisable and testable with zero external
dependencies. The API selects the provider in `createOcrClientFromEnv`.

`OCR_PROVIDER=hosted` → `HostedOcrClient` (apps/api/src/lib/ocr/hosted.ts) is a
stub behind `// TODO(OCR-SPIKE)` that throws until the spike resolves.

## Open questions to close the spike
1. Median receipt image size + expected monthly upload volume → hosted $/mo.
2. Accuracy bar on Indian retail receipts (GST invoices, multilingual) — does a
   hosted API beat a small on-device model by a margin that justifies egress?
3. Provider DPA + data-retention posture for `FINANCIAL` PII.

## Recommendation (pending data)
Start hosted for quality, but route through the upload worker (never the
client) so images are deleted after parsing and only structured JSON is
persisted to `receipts.ocr_json`. Revisit on-device once volume justifies the
engineering cost.
