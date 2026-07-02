# Architecture

## Pipeline overview

```
┌─ Collectors ─────────────────┐
│ TG user session (GramJS)     │      ┌───────────┐    ┌──────────────┐
│ 21+ job boards (JSON APIs,   │ ───► │ Normalize │ ─► │ Dedup        │
│ RSS feeds, multi-company ATS)│      │ → schema  │    │ (hash+fuzzy) │
└───────────────────────────────┘      └───────────┘    └──────┬───────┘
                                                                ▼
┌─ Telegram bot (grammY) ◄──── ┌─ LLM scoring ◄──── ┌─ Hard filters ─┐
│ card: score, stack,          │ BullMQ queue        │ no LLM needed: │
│ salary, link, reasons        │ → llama-server/vLLM │ seniority,     │
│ 👍/👎 buttons                │ per-user fan-out     │ remote, stack  │
└───────────────────────────────└─────────────────────└────────────────┘
```

Flow: new vacancy → normalize → dedup → cheap filter (cuts ~80%) → per-user scoring
queue → LLM compares against each user's profile → score above threshold → Telegram
card + web feed entry.

## Stack

- Backend: NestJS 11, strict TypeScript
- Queues/cron: BullMQ + Redis
- DB: PostgreSQL + Prisma
- Frontend: Vue 3 + Pinia
- Telegram channel reading: GramJS (user session, MTProto)
- Notification bot: grammY
- LLM: any OpenAI-compatible endpoint (llama-server, vLLM), structured output via
  `response_format: json_schema`
- Site collection: native `fetch` + light HTML/JS parsing, official APIs/RSS where available

## Data model

```prisma
model User {
  id         String   @id @default(cuid())
  email      String   @unique
  createdAt  DateTime @default(now())
  tgChatId   String?  @unique
  tgUserId   String?  @unique
  profile    UserProfile?
  matches    UserMatch[]
  sessions   Session[]
  llmCalls   LlmCall[]
}

model Session {
  id        String    @id @default(cuid())
  userId    String
  token     String    @unique
  expiresAt DateTime
  claimedAt DateTime?
}

model UserProfile {
  id           String   @id @default(cuid())
  userId       String   @unique
  cvText       String
  coreStack    String[]
  strongPlus   String[]
  redFlags     String[]
  seniority    String?
  locationPref String[]
  salaryMin    Int?
  salaryTarget Int?
  updatedAt    DateTime @updatedAt
}

model Vacancy {
  id        String      @id @default(cuid())
  source    String
  title     String
  company   String?
  rawText   String
  dedupHash String      @unique
  status    String      @default("new")
  matches   UserMatch[]
}

model UserMatch {
  id         String   @id @default(cuid())
  userId     String
  vacancyId  String
  score      Int
  reasonsPro String[]
  reasonsCon String[]
  redFlags   String[]
  verdict    String?
  appStatus  String?
  model      String
  createdAt  DateTime @default(now())
  @@unique([userId, vacancyId])
}

model LlmCall {
  id               String   @id @default(cuid())
  userId           String?
  taskType         String   // "cv-parse" | "extract" | "score"
  model            String
  promptTokens     Int
  completionTokens Int
  latencyMs        Int
  ok               Boolean
  createdAt        DateTime @default(now())
}
```

`Vacancy` is a shared pool — collectors dedupe into it exactly once, regardless of how
many users are active. `UserMatch` is the per-user result of scoring one vacancy
(score, feedback, application status). Every LLM call, across every task type, is
logged to `LlmCall` for cost and quality analytics.

## Accounts and onboarding

One `User` record is the hub; the web dashboard and the Telegram bot are both just
clients of it, linked via a one-time code. Sign-up is magic-link based (email in an
allow-list gets a session, no password).

Onboarding: paste a CV → an LLM call (`taskType: cv-parse`) extracts `coreStack`,
`seniority`, `salary`, `redFlags`, and `locationPref` → the user reviews the result as
editable chips before it's saved. The CV is kept as raw text so it can be re-parsed
after an update.

## Scoring at multi-user scale

Collectors fill the shared `Vacancy` pool once; scoring then fans out per active user.
The queue job key is `(vacancyId, userId)`, idempotent via `score-<userId>-<vacancyId>`.
A per-user hard filter (seniority/stack/location from that user's profile) runs before
the LLM call to cut volume. At beta scale, scoring every user against every vacancy with
a full LLM call is cheap enough; an embedding-based shortlist (embed CV ↔ vacancy, score
only the top-K) is a straightforward addition later if volume grows past that.

## Multi-model routing

Because every call is logged with its task type, token counts, and latency, routing
cheap tasks to cheap models is a config change, not a redesign: `LLM_MODEL_SCORE`,
`LLM_MODEL_PARSE`, and `LLM_MODEL_EXTRACT` each independently override the default
model and base URL. CV parsing and field extraction are pure extraction and tolerate a
small, fast model; scoring is where model quality actually shows up in output, so it
keeps a stronger reasoning model with `LLM_THINKING` on.

## Working with the LLM

- Any OpenAI-compatible endpoint, configurable via `LLM_BASE_URL`
- Structured output via `response_format: json_schema` — the schema forces intermediate
  verdicts (seniority match, location match, dealbreaker) before the final score, so a
  flagged dealbreaker caps the score in code rather than relying on the model to apply
  the rule itself
- A health check runs before any batch of scoring work is enqueued

## Telegram card

See `backend/src/telegram/telegram-card.formatter.ts` — a pure function so it's
unit-testable without a running bot.

## Security / privacy

- Session tokens, API keys, and Telegram credentials live only in `.env`, never in git
- The client never calls the LLM or any collector target directly — everything routes
  through the backend, which is the only thing holding credentials
- Owner-only surfaces (analytics, settings, collection triggers, golden-set labeling)
  are gated behind a dedicated guard, separate from the per-user session guard
