# Running it 24/7

No GPU needed on the app server — just Node 22+, PostgreSQL, and Redis. The LLM is
reached over HTTP via `LLM_BASE_URL`: a local llama-server, or a rented GPU pod (see
[docs/runpod.md](runpod.md)).

## Option A — VPS (recommended)

Any small VPS with 4 GB RAM (e.g. Hetzner CX22, ~€5/mo) is enough.

```bash
# 1. Infra
apt install -y nodejs npm postgresql redis-server   # or: docker compose up -d

# 2. Code
git clone <this-repo> && cd job-radar
npm install
cp backend/.env.example backend/.env   # fill in: LLM_BASE_URL -> your endpoint
cd backend && npx prisma migrate deploy && cd ..
npm run build -w backend

# 3. Process manager
npm i -g pm2
pm2 start backend/dist/src/main.js --name job-radar
pm2 save && pm2 startup
```

Dashboard: `npm run build -w client`, serve `client/dist` with nginx (or just run
`npm run dev -w client` locally, pointed at the VPS API).

Update: `git pull && npm install && npm run build -w backend && pm2 restart job-radar`
(migrations: `npx prisma migrate deploy` in `backend/`).

## Option B — next to a local LLM rig

Same steps, but `LLM_BASE_URL=http://127.0.0.1:1234/v1` with no API key, and
postgres+redis from `docker-compose.yml`. The scoring queue survives the LLM going
offline overnight — jobs retry for ~14 hours and a backlog reconciler re-enqueues
anything stale on boot and on a daily cron.

## Backups

All state that matters lives in PostgreSQL (vacancies, scores, feedback). Daily:

```bash
pg_dump -Fc jobradar > /backups/jobradar-$(date +%F).dump
```

Redis doesn't need backing up — the queue rebuilds itself from the database on startup.

## Health

- `GET /health` — app status + LLM reachability
- `GET /api/stats` — pipeline, queue depth, LLM status, scoring throughput
- `/stats` and `/health` are also available as Telegram bot commands
