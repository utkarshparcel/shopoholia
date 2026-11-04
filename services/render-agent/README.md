# @worn/render-agent

Renders WORN reveals and try-on previews on the owner's Apple-silicon Mac. It leases jobs from
the API over HTTPS, renders them with the local mediagen server, uploads the result to R2 through
a signed URL, and reports back. Outbound only; no inbound connections; no copies kept. Design and
API: `docs/RENDER_AGENT.md`.

**Status:** the mediagen adapter (`src/mediagen.ts`) is a stub that throws
`MediagenNotConfiguredError`. Until it is filled in, the agent exits with code 78 instead of
leasing jobs. Use `--dry-run` to test everything else.

## Configuration

| Variable | Default | |
|---|---|---|
| `WORN_API_URL` | — | The API, e.g. `https://api.worncloset.app` (https; http only for localhost). |
| `RENDER_AGENT_TOKEN` | Keychain | Read from the Keychain (`security find-generic-password -w -s worn-render-agent`) when unset. Must match the API's `RENDER_AGENT_TOKEN`. |
| `AGENT_ID` | `mac-1` | This agent's name in leases and heartbeats. |
| `MEDIAGEN_URL` | `http://127.0.0.1:8199` | The local mediagen server. |
| `RENDER_AGENT_WINDOW` | `always` | Or `23:00-06:30`: outside it the agent sleeps. |
| `RENDER_AGENT_TIME_ZONE` | `Asia/Kolkata` | |
| `RENDER_AGENT_WORK_DIR` | `$TMPDIR/worn-render-agent` | Per-job temp folders, deleted after each job. |
| `RENDER_AGENT_POLL_SECONDS` | `30` | Lease poll interval when idle. Heartbeat every 60 s. |

`--dry-run` (or `RENDER_AGENT_DRY_RUN=1`) uses a fake engine that copies the model photo: it leases
real jobs and completes them with the model photo, so use it against a staging API only.

## Mac setup (owner)

1. **FileVault on** (System Settings → Privacy & Security → FileVault).
2. **A separate macOS user** for rendering (optional, recommended), e.g. `worn-render`, standard
   (not admin). Everything below runs as that user.
3. **Node 22** (`brew install node@22`) and the repo:
   ```sh
   git clone <repo> ~/worn && cd ~/worn
   pnpm install --frozen-lockfile
   pnpm --filter @worn/render-agent build
   ln -s ~/worn/services/render-agent ~/worn-render-agent
   ```
4. **The token, in the Keychain** (never in the plist or a file). Generate it once, set the same
   value as `RENDER_AGENT_TOKEN` on the API:
   ```sh
   openssl rand -hex 32            # copy it to the API's env
   security add-generic-password -a "$USER" -s worn-render-agent -w
   ```
   (`-w` with no value prompts for it, so it doesn't land in shell history.) The first run shows a
   Keychain prompt: choose "Always Allow" for `security`.
5. **The work folder, out of backups and search**:
   ```sh
   mkdir -p ~/worn-render-work && chmod 700 ~/worn-render-work
   tmutil addexclusion ~/worn-render-work
   touch ~/worn-render-work/.metadata_never_index
   ```
   Do the same for mediagen's own `outputs/` folder and `state.json`.
6. **mediagen listens on 127.0.0.1 only** (port 8199); check with `lsof -iTCP:8199 -sTCP:LISTEN`.
   No port forwarding, no inbound firewall rule: the agent only makes outbound calls.
7. **Fill in the mediagen adapter** (`src/mediagen.ts`, see the box at the top), rebuild.
8. **Try it**: `WORN_API_URL=https://staging-api… node dist/index.js --dry-run`, then without
   `--dry-run` once mediagen is wired.
9. **Run it under launchd**: copy `deploy/app.worncloset.render-agent.plist` to
   `~/Library/LaunchAgents/`, replace `RENDER_USER` and the paths, then
   ```sh
   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/app.worncloset.render-agent.plist
   launchctl kickstart -k gui/$(id -u)/app.worncloset.render-agent   # restart after an update
   tail -f ~/Library/Logs/worn-render-agent.log
   ```
   `KeepAlive` restarts it after a crash or reboot; `caffeinate -i` stops idle sleep while it runs.
   Log in as the render user after a reboot (or enable automatic login for it) so the LaunchAgent
   starts. A UPS is worth having: a power cut stops renders until the Mac is back.
10. **API settings**: `RENDER_BACKEND=agent`, `RENDER_AGENT_WINDOW=always`, `RENDER_OVERFLOW=none`,
    `RENDER_AGENT_TOKEN` (docs/DEPLOY.md, "Renders").

Hygiene, from the plan (§8.10): inputs are fetched under random names into a per-job folder that
is deleted after every job; logs carry job ids only, never URLs or images; the token stays in the
Keychain; the agent sends pictures only to R2 through signed URLs.
