# WORN — Cursor Implementation Plan

> **Product:** A fashion marketplace where the **shopping arc is the product**. Nothing ships; the reward is AI renders of the user wearing what they "bought."
>
> **Docs:** `docs/worn-spec.html` (product spec), `docs/IMPLEMENTATION_PLAN.md` (engineering detail), `docs/design-system/` (tokens + style guide).

---

## 1. Product thesis

**The dopamine was never in the delivery.**

Online shopping's pleasure is in the anticipation loop — browse, imagine yourself in it, build the cart, checkout, wait for the tracker. WORN perfects the fantasy and strips out physical fulfillment.

| Real e-commerce | WORN |
|---|---|
| Feed, listings, cart, checkout | Identical UX |
| Order tracking + push notifications | Identical UX (simulated) |
| "Package arrived" moment | Identical UX — unboxing is photos |
| Physical delivery, returns | **Removed** |
| Real money per item | **WORN Coins** (IAP bundles) |
| Delivery outcome | **Cinematic AI reveal** |

**Core loop:** `see → desire → commit → wait → reveal → share → repeat`

**Phase I north star:** Does the reveal moment land emotionally? Nothing else matters until that's true.

---

## 2. Engineering reality checks

| Spec claim | Reality | Plan |
|---|---|---|
| Real-time try-on in feed scroll | Too slow + expensive | Feed = house model; try-on on detail open, cached |
| Avatar "embeddings" | APIs need model + garment images | Pose-normalized reference image in R2 |
| On-device embedding, no photo storage | Server-side try-on needs reference | Encrypt at rest; delete raw uploads after processing |
| 6–8 pre-generated reveal renders | Cost center | Pre-gen 2 free; generate paywalled on unlock |
| Express = 2 hours | Too slow for beta | Config-driven timers; beta ≈ 5 min total arc |

**The moat is the render pipeline.** Spike it in Week 2 before building surrounding ecomm.

---

## 3. Monorepo structure

```
worn/
├── apps/
│   ├── mobile/          # Expo Router (iOS + Android)
│   └── api/             # Fastify HTTP API
├── services/
│   ├── worker-orders/   # BullMQ: order state machine + timers (Week 4)
│   └── worker-render/   # BullMQ: render pipeline (Week 5)
├── packages/
│   ├── shared/          # Zod schemas, DTOs, economy constants
│   ├── db/              # Drizzle schema + migrations
│   └── config/          # Env validation (zod), tsconfig, eslint
├── infra/
│   └── docker-compose.yml
└── docs/
    ├── worn-spec.html
    ├── IMPLEMENTATION_PLAN.md
    └── design-system/
```

### Stack

| Layer | Choice |
|---|---|
| Mobile | Expo + React Native + Expo Router |
| Animation | Reanimated 3 |
| Client state | Zustand + TanStack Query |
| API | Fastify + fastify-type-provider-zod |
| DB | PostgreSQL + Drizzle |
| Queue | BullMQ on Redis |
| Storage | Cloudflare R2 + signed URLs |
| Auth | Phone OTP → JWT |
| Try-on | FASHN.ai |
| Reveal styling | ComfyUI (self-hosted GPU) |
| IAP | RevenueCat (Phase II) |

---

## 4. Design system contract

**Source of truth:** `docs/design-system/tokens.css`

**App mirror:** `apps/mobile/src/theme/tokens.ts` — all token names and values 1:1.

**Fonts:** DM Serif Display (headlines), DM Sans (body), DM Mono (labels).

**Core kit (v0.1):** SectionHeader · Button · Chip · ListingCard · CoinWallet · OrderTracker · BottomNav · (Week 5+) Reveal deck · Paywall sheet

Change `tokens.css` first, then propagate to `tokens.ts`.

---

## 5. Data model (Phase I)

| Table | Purpose |
|---|---|
| `users` | phone, display_name, avatar_status, coin_balance_cache, consent_flags, push_token |
| `avatars` | user_id, reference_image_key, source_upload_keys, body_meta, status |
| `listings` | seller_id (null = seeded), title, category, tags, coin_price, images, house_model_render_key |
| `listing_variants` | listing_id, size, color, garment_image_key |
| `tryon_previews` | cache: user + variant → image |
| `carts` / `cart_items` | standard cart with price snapshots |
| `orders` | tier, state, coin_total, state_eta, reveal_ready_at |
| `order_items` | line items |
| `renders` | scenario, image_key, is_free, unlocked, provider, status, cost_micros |
| `coin_ledger` | append-only double-entry |
| `iap_receipts` | RevenueCat idempotency |
| `push_events` | notification audit |

---

## 6. API surface

```
Auth        POST /auth/otp, /auth/verify, /auth/refresh
Avatar      POST /avatar, GET /avatar, DELETE /avatar
Feed        GET /feed?cursor=, GET /listings/:id, POST /listings/:id/tryon
Cart        GET/POST/DELETE /cart
Orders      POST /orders, GET /orders, GET /orders/:id
Coins       GET /coins/balance, GET /coins/transactions, POST /coins/iap/validate
Reveal      GET /orders/:id/reveal, POST /orders/:id/reveal/unlock
Webhooks    POST /webhooks/revenuecat, POST /webhooks/render-callback
```

Week 1: typed route stubs returning 501. Week 2+: implement.

---

## 7. Order state machine

**States:** `PENDING → PROCESSING → PACKED → OUT_FOR_DELIVERY → ARRIVING_SOON → DELIVERED → REVEAL_READY`

1. Checkout debits coins (serializable tx) → `PROCESSING`
2. BullMQ schedules full transition ladder at checkout
3. Each job idempotent (guard on current state)
4. Every transition: DB update → push → bump `state_eta`
5. `DELIVERED` enqueues 2 free renders per item → `REVEAL_READY`

**Tier timings** in `packages/shared/src/economy.ts`:
- Prod Express: ~2h | Standard: ~overnight | Slow Burn: ~48h
- Beta (all tiers): ~5 min

---

## 8. Render pipeline (the moat)

1. **Avatar reference** (onboarding): validate uploads → pose-normalized reference → R2 → delete raw uploads
2. **Feed/detail try-on** (cheap): FASHN.ai, cached in `tryon_previews`, never blocks scroll
3. **Reveal** (expensive): FASHN try-on → ComfyUI scenario styling → 2 free + paywalled on unlock

**Scenarios:** STUDIO, GOLDEN_HOUR, STREET, EDITORIAL_DARK, NIGHT, CANDID

---

## 9. Mobile screens

```
app/
├── index.tsx                     # redirect → feed
├── (onboarding)/avatar.tsx
├── (tabs)/
│   ├── feed.tsx
│   ├── lookbook.tsx              # Phase II
│   └── profile.tsx
├── listing/[id].tsx              # Week 3
├── cart.tsx                      # Week 3
├── checkout.tsx                  # Week 4
├── order/[id].tsx                # Week 4
└── reveal/[orderId].tsx          # Week 5
```

---

## 10. Phased rollout

### Phase I — Core loop MVP (6 weeks)

| Week | Focus | Exit criteria |
|---|---|---|
| **1** ✅ | Monorepo, schema, API stubs, mobile shell + design system | `pnpm build` passes; app runs with tab nav |
| **2** | Render spike (FASHN + ComfyUI) + avatar upload | Renders look flattering on 3 test subjects |
| **3** | Feed + try-on + cart (50 seeded listings) | Infinite scroll + cached try-on on detail |
| **4** | Checkout + state machine + tracking + push | Full wait arc with beta timers |
| **5** | Render pipeline + reveal screen | 2 free renders → REVEAL_READY + swipe deck |
| **6** | Beta harden (Sentry, analytics, TestFlight) | 50 users; reveal satisfaction measured |

### Phase II — Sellers + growth (6w)
Seller listings, feed ranking, lookbook, social share, affiliate CTA, RevenueCat IAP live.

### Phase III — Retention (8w)
Coin streaks, buyer-becomes-model opt-in, premium render packs, A/B economy, D30 > 25%.

### Phase IV — Scale (ongoing)
Self-hosted GPU cluster, brand collections, video renders, per-user LoRA.

---

## 11. Week 1 checklist (current sprint)

- [x] pnpm workspaces + turbo.json
- [x] infra/docker-compose.yml (postgres + redis)
- [x] packages/config — env validation
- [x] packages/db — Drizzle schema (all Phase I tables) + migration
- [x] packages/shared — order schemas + economy constants
- [x] apps/api — Fastify skeleton + typed route stubs
- [x] apps/mobile — Expo Router + theme tokens (1:1 from design system)
- [x] apps/mobile — core UI: Button, SectionHeader, Chip, ListingCard, CoinWallet, OrderTracker, BottomNav
- [x] apps/mobile — tab shell: feed, lookbook, profile, avatar onboarding
- [x] services/worker-orders placeholder (Week 4)
- [x] services/worker-render placeholder (Week 5)
- [x] `pnpm build` passes (@worn/shared + @worn/api)

### Week 2 early progress (from parallel agents)

- [x] Avatar API routes (upload/get/delete) with in-memory deps + mock storage
- [x] `RenderProvider` interface + FASHN mock provider
- [x] Auth/avatar Zod schemas in `@worn/shared`
- [ ] FASHN.ai live integration + quality spike
- [ ] ComfyUI scenario pass
- [ ] Mobile photo picker wired to `POST /avatar`

### Local dev

```bash
# Start infrastructure
docker compose -f infra/docker-compose.yml up -d

# Install + build
pnpm install
pnpm build

# Run API
pnpm dev:api

# Run mobile
pnpm --filter @worn/mobile start
```

---

## 12. Week 2 — Next up

1. **Render spike (highest risk)** — FASHN.ai integration: reference image → garment try-on quality bar
2. **ComfyUI box** — scenario styling pass on 2–3 looks
3. **Avatar upload endpoint** — multipart → async processing job → reference in R2
4. **Onboarding flow** — real photo picker + processing state + coin grant on signup
5. **Gate:** Do renders look genuinely flattering? If not, escalate before continuing.

---

## 13. Privacy & legal (do not defer)

- Explicit consent at photo upload
- Delete raw uploads after reference derivation; encrypt at rest
- `DELETE /avatar` hard-delete cascade (DPDP/GDPR)
- Transparent onboarding: "the experience, not the outcome"
- Signed-URL-only image access

---

## 14. Metrics (instrument from Day 1)

**Funnel:** install → avatar complete → first add-to-cart → checkout → wait completion → reveal opened → reveal rated → paywall unlock → share

**North star (Phase I):** reveal satisfaction score

**Unit economics:** render cost/order, coin earn/spend curve, D1/D7/D30 retention

---

## 15. Open questions

| Question | Hypothesis | Test |
|---|---|---|
| Optimal wait duration | Express = 2h prod | A/B cohorts |
| Free/paywall split | 2 free / 4–6 paywalled | Unlock rate vs IAP |
| Feed imagery | House model in feed | Engagement test |
| Generate-on-unlock | On unlock (MVP) | Cost vs conversion |
