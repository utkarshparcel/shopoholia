# The render agent

Worn Play's reveal looks and "Try on me" previews are rendered on the owner's Apple-silicon Mac,
not by a paid API. A small program there, the **render agent** (`services/render-agent`), asks the
WORN API for work, renders it with the local **mediagen** server (mlx-serve with mage-edit, which
keeps face, hair and pose), and hands the image back through R2. FASHN is optional overflow, off
by default.

Owner's decision: renders run on the Mac **all day** (`RENDER_AGENT_WINDOW=always`); an overnight
window (`23:00-06:30`) is still a setting. Each piece in a haul gets **one** free scene (Studio);
the other five unlock for 50 coins.

## How it fits

```
 app ──▶ API (Postgres: renders, tryon_previews)          R2 (images)
          ▲   │ lease / complete / fail / heartbeat         ▲      │
          │   ▼            HTTPS, outbound only             │PUT   │GET (signed, 15 min)
          └── render agent (Mac, launchd, caffeinate -i) ───┘◀─────┘
                    │
                    ▼ 127.0.0.1:8199
                 mediagen (mlx-serve, mage-edit)
```

1. An order is delivered: its free render (one per piece) is created `QUEUED`. A paid unlock,
   generate or combine, a retry, and a try-on preview are queued the same way. With
   `RENDER_BACKEND=agent` nothing renders in the API process.
2. The agent sends `POST /agent/heartbeat` every 60 s and `POST /agent/renders/lease` every 30 s
   (straight away again after a job). A lease takes the oldest waiting jobs atomically
   (`FOR UPDATE SKIP LOCKED`), marks them with the agent's id and a 10-minute expiry, and returns
   for each: the job id, its kind (`render` or `tryon`), the scene, signed GET URLs for the model
   photo and the garment photo(s) in order, and a signed PUT URL with its content type.
3. The agent downloads the inputs to a private temp folder under random names, calls mediagen,
   checks the output (a real JPEG, at least 512 px on its short side, not blank, not the model
   photo again; a failure is reported retryable as `quality:<check>` and never uploaded), PUTs the
   JPEG to R2, and calls `POST /agent/renders/:id/complete`. The API checks the object is
   in R2, marks the render `DONE`, and (for a free render) opens the reveal and sends the push,
   the same path as before.
4. On an error the agent calls `POST /agent/renders/:id/fail` with `retryable`. A retryable
   failure goes back to the queue until the job has taken 3 leases; after that, or when not
   retryable, it fails through `failRender`, which refunds a paid render once. The temp folder is
   deleted after every job, whatever happened.
5. A lease that lapses (the Mac slept, crashed, lost the network) goes back to the queue, checked
   every minute and before each lease.

The agent sees job ids, scenes and signed URLs only: no user ids, order ids or other personal
data. (The model photo's signed URL is the avatar's storage path, which contains the account's
random id; the output key does not.) It accepts no inbound connections and keeps no copies.

## API

All routes take `Authorization: Bearer $RENDER_AGENT_TOKEN` (constant-time compare; never a user's
JWT), are rate limited, and answer 401 without the right token.

| Route | Body | Answer |
|---|---|---|
| `POST /agent/heartbeat` | `{agentId, version}` | `{ok, serverTime, backend}` |
| `POST /agent/renders/lease` | `{max (1–10), agentId}` | `{jobs: [{id, kind, scenario, attempt, leaseExpiresAt, modelImageUrl, garmentImageUrls[], output: {url, method: "PUT", contentType}}]}`; empty unless `RENDER_BACKEND=agent` |
| `POST /agent/renders/:id/complete` | `{agentId}` | `{status: "DONE"}`; 409 `output_missing` if nothing was uploaded, 409 `not_leased` if the agent no longer holds the lease |
| `POST /agent/renders/:id/fail` | `{retryable, reason, agentId}` | `{status: "QUEUED" \| "FAILED"}` |

Migration `0025_render_agent_leases` adds `lease_owner`, `lease_expires_at` and `attempts` to
`renders` and `tryon_previews`, and the `render_agents` table (last heartbeat per agent).

## Waiting and overflow

The reveal (`GET /orders/:id/reveal`) carries `rendersWaiting` and `expectedReadyAt` when renders
are waiting for the agent:

- **always window**: when the agent is down (no heartbeat for 3 minutes; `expectedReadyAt` is null
  and the app says "shortly"), or the queue is backed up (queue depth × 60 s, plus 30 minutes).
- **night window**: outside it, the window's start plus the queue, never later than its end, plus
  30 minutes.

The app shows "Delivered — your reveal is being styled and will be ready by about 7 AM. We'll send
you a push." on the order and reveal screens, in the user's locale and time zone.

A listing try-on preview (`POST /listings/:id/tryon`) answers 202 `PROCESSING` with the same
`rendersWaiting` and `expectedReadyAt`, from the same estimate (`agentWaitEstimate`). While it is
waiting the app stops polling and shows "Your try-on is being styled and will be ready by about
7 AM. Tap Try on me again to see it." ("shortly" with no time) under the button. A preview sends
no push.

`RENDER_OVERFLOW=fashn` (with `FASHN_API_KEY`) hands a job to FASHN, through the old in-process
pipeline at 1k balanced, when it is queued outside the window, when the agent has been silent for
3 minutes, or when it is still unleased after `RENDER_OVERFLOW_AFTER_MINUTES` (15). With `none`
jobs wait.

The API reports an agent that is silent for 5 minutes inside its window while jobs are queued
(log line and Sentry, `area: render-agent`), once per outage.

Every setting is in `docs/DEPLOY.md` ("Renders"). Mac setup: `services/render-agent/README.md`.

## What is still to do

- **The mediagen adapter is a stub** (`services/render-agent/src/mediagen.ts`). mediagen's HTTP
  API isn't documented here, so the agent refuses to lease jobs until someone fills in its
  endpoint, request format (model photo, garment photos, prompt, seed, steps), how the output
  comes back, its clean-up call, and tunes the six scene prompts. `--dry-run` tests the whole loop
  with a fake engine that mirrors the model photo.
- The quality checks before upload cover format, size, blank and unchanged output
  (`services/render-agent/README.md`). Face similarity, garment colour and safety (plan §4.7) need
  an ML model and are not built.
