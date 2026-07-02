# Day-to-day usage guide

A quick-reference cheat sheet: what's where, how to use it, what to do in common
situations.

## Where things are

| What | Where |
|---|---|
| Dashboard | `npm run dev -w client` → http://localhost:5173, API on :3000 |
| Settings | `backend/.env` (template: [.env.example](../backend/.env.example)) |
| Renting a GPU | [runpod.md](runpod.md) · Running 24/7: [deploy.md](deploy.md) |

## Daily cycle

1. Collectors run automatically every 2 hours; Telegram channels are listened to in
   real time.
2. Junk and duplicates are filtered out before the LLM ever sees them; everything else
   queues for scoring.
3. Once the LLM is reachable, the queue drains. Score ≥ threshold → an immediate
   Telegram card.
4. **9:00** — a single digest message for the "gray zone" (scores just below threshold)
   from the last 24 hours.
5. 👍/👎 on each card feeds back into threshold and prompt calibration.
6. Applied to something? Mark it on the dashboard (applied → screening → interview → …).

## Bot commands

| Command | Does |
|---|---|
| *(forward or paste a vacancy)* | Manual scoring → card with reasons |
| `/digest` | Top 5 scored vacancies above threshold |
| `/stats` | Status funnel + queue depth + LLM status |
| `/health` | Is the LLM reachable |
| `/channels` | `list` · `add @handle` · `remove @handle` |

## Dashboard

Start with `npm run dev -w client` (the backend must be running on :3000).

- **Vacancies** — filterable table (status, source, min score, search), a detail view,
  and application tracking. The **"Mark applied"** button on a row starts the
  applied → screening → interview → offer trail.
- **Labeling** — build a golden set for evaluation: Yes/Maybe/No buttons (keys 1/2/3),
  ~50 vacancies is enough for a useful eval run.
- **Settings** — see below.
- **Health bar** — LLM online/offline + queue depth.

## Settings tab

- **Sources** — which job boards are active. A toggle per collector plus a live count of
  what it's collected. A disabled collector is skipped on the next cron run (every 2
  hours).
- **Telegram channels** — add/remove channels to listen to (same as the bot's
  `/channels`, but from the UI).
- **Profile & tags** — this is **what the LLM scores against**:
  - **Core stack** — your primary stack (React, Node.js, NestJS…). The main scoring
    driver.
  - **Nice to have** — bonus skills that boost a score without being required.
  - **Red flags / exclude** — what to filter out (junior-only, wrong stack, onsite-only…).
  - Salary target (min/target). The notification threshold is shown read-only (change it
    via `SCORING_THRESHOLD` in `.env`).
  - **Save profile** — persists the profile; the LLM scores against the new version
    immediately.

## Evaluating scoring quality

1. **Labeling** tab → hand-label ~50 vacancies ("would apply / maybe / pass").
2. `npm run golden:eval -w backend` — runs the labeled set against the current LLM.
3. Look at **false alarms** (labeled "pass" but scored high — the bot is spamming) and
   **misses** (labeled "would apply" but scored low — the bot is missing good matches).
4. Change the model or prompt → re-run → compare the numbers. The model name is recorded
   on every score for exactly this comparison.

## FAQ

**Is anything lost if the LLM goes offline?**
No. Jobs stay queued in BullMQ with retries for ~14 hours, and a backlog reconciler
re-queues anything stuck on startup and daily. Even losing Redis is recoverable — the
queue rebuilds from PostgreSQL.

**How do I switch between a local LLM and a rented GPU?**
Just `.env`: `LLM_BASE_URL`, `LLM_API_KEY`, `SCORING_CONCURRENCY` (1 for a single-slot
local server, 6–8 for a GPU pod), then restart. Details: [runpod.md](runpod.md).

**Too many or too few cards?**
`SCORING_THRESHOLD` in `.env` (default 65). Decide based on the eval numbers and the
gray-zone digest, not by feel.

**A vacancy is obviously wrong for the score it got?**
Hit 👎/👍 — periodically review the disagreements and adjust the scoring rubric or the
candidate profile.

**Updated your CV / skills?**
Edit the profile in the dashboard's Settings tab (or `candidate-profile.json` for the
single-user setup) and it takes effect immediately — it's the single source of truth for
matching.

**Adding a new source?**
Telegram channel: `/channels add @handle` — that's it. A new site: add a collector under
`backend/src/collectors/` following the existing `JobCollector` interface (~100 lines
plus a spec).

**Something broke — where do I look?**
Bot `/stats` → `GET /health` → application logs. The database is the source of truth —
vacancy statuses show exactly where something got stuck.
