# Job Radar — Implementation Guidelines (for AI agents)

You are responsible for fully implementing and "closing" the Job Radar project.

## Core Principles

- Produce **clean, production-quality, idiomatic NestJS + TypeScript** code.
- **Strict rule**: Never put decision explanations, "as per tech-spec", "following roadmap", "D1/D3", "because we chose X", "optimal because...", or similar commentary inside source code files (`.ts`, `.prisma`, configs, etc.).
  - Code must read as if it was written by a senior engineer who just knew the right structure.
  - All rationale lives in commit messages, this AGENTS.md, or separate `/docs` markdown.
- When requirements are ambiguous, unclear, or have several good approaches:
  - Choose the **most pragmatic, maintainable, and aligned with the overall architecture** (depth over volume, clean separation, local LLM on rig, minimal magic).
  - If the choice has significant user impact (e.g. exact notification threshold default, how to handle missing salary, exact profile fields, sleep schedule implications, auth flow details), **nicely and clearly ask the user** with:
    - A short proposed optimal solution.
    - 1-2 concrete alternatives.
    - Why the proposal is good.
  - Do not block on minor details — decide and note if needed in docs.
- Prioritize a **working, valuable Phase 1** (manual "forward job to bot → scored Telegram card") as early as possible. Everything else is scaffolding toward that.
- Respect the architecture described in `docs/tech-spec.md`.
- The final system runs on the Windows rig next to the llama-server (`http://127.0.0.1:1234/v1`). The code must be configurable for that environment (via .env / @nestjs/config).

## Project Goals (high level)

- 24/7 collection of jobs from Telegram channels (GramJS user session) + job boards.
- Cheap hard filters + dedup first.
- LLM scoring (structured JSON) against a candidate profile using the local rig LLM.
- Clean Telegram cards with score + reasons + 👍/👎 feedback.
- "Depth over volume": high quality matches only. No auto-apply.

## Tech Constraints (non-negotiable from specs)

- Backend: NestJS (TypeScript)
- Queues & scheduling: BullMQ + Redis
- DB: PostgreSQL + Prisma
- Bot: grammy
- TG user client (for channels): telegram (GramJS)
- LLM: direct calls to llama-server OpenAI-compatible endpoint with `response_format: { type: "json_schema" }`
- Infra for local dev/runtime: docker-compose (postgres + redis)
- No web dashboard in v1. Telegram is the UI.
- No embeddings/RAG in v1.
- No LinkedIn parsing, no auto-apply.

## Development Workflow

1. Ship in phases with a clear "done" state after each one that can actually be tested, starting from the smallest useful slice (manual "forward job to bot → scored card").
2. Update the GitHub repo frequently with clean commits.
3. When adding features, keep modules/services cleanly separated (collectors, scoring, telegram, prisma, queue).
4. Use strong types everywhere. Prefer DTOs + validation for external input.
5. For the LLM scoring service: always check health first when possible, support retries/backoff via BullMQ, handle the case when the model is busy (ComfyUI etc.).
6. candidate-profile.json is the single source of truth for matching. Keep it simple but rich (core skills with rough weights, hard requirements, nice-to-haves, red flags, company tier boosts).
7. All secrets (.env, session strings, api keys) stay out of git. Provide good .env.example.

## When to Ask the User

Ask clearly (with proposal) for:
- Exact defaults for scoring threshold, digest behavior.
- Precise handling of "no salary" vacancies.
- Any changes to candidate profile fields or weights.
- Rig power/sleep policy implications on queue design.
- Bot commands naming or UI text for cards.
- Any scope changes.

Do not ask for every tiny implementation detail — use best judgment for clean code.

## Code Style

- Clean, readable, minimal boilerplate.
- Proper NestJS module organization.
- No magic strings where constants/enums make sense.
- Error handling that doesn't lose jobs (BullMQ persistence).
- Logging that is useful on the rig (no excessive noise).

## Non-Goals for v1 (explicitly out of scope per decisions)

- Auto-apply / auto-reply to recruiters.
- Web UI / dashboard.
- LinkedIn scraping.
- Heavy RAG or vector search.

Follow this file on every change. The goal is a fully working, clean implementation that matches the documented plan as closely as possible.

---

This is the actual guideline file used by AI coding agents throughout this project's development. See [docs/ai-workflow.md](docs/ai-workflow.md) for how work was decomposed and reviewed across parallel agent sessions.
