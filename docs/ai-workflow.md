# How this was built: parallel AI agent orchestration

This project's multi-user rewrite (auth, per-user feed, LLM-call analytics, multi-model
routing) was built by running several AI coding agents (Claude Code) in parallel against
the same repository, coordinated by a single "orchestrator" chat that never touched code
itself. This document describes that process — not as a retrospective, but as the actual
working method, reconstructed from the internal runbooks used during development.

## Roles

**Orchestrator (Opus-class model, no code writing).** Owns the backlog, breaks it into
tasks small enough for one agent to close in one sitting, writes self-contained prompts,
reviews what comes back, resolves conflicts, and owns every commit. Keeping the
orchestrator out of the diff-writing loop matters: it stays free to hold the cross-cutting
picture (schema shape, migration safety, which module is mid-flight) instead of getting
absorbed into one file's boilerplate.

**Worker agents (terminal sessions, model chosen per task).** Each worker gets one
self-contained prompt and closes one task: implement, test, run build/lint/test locally,
report back. Workers never commit — that stays a deliberate gate, described below.

**Model routing rule of thumb:**
- **Fast/cheap model** for tasks with a contract already fully specified up front — an
  isolated module, a CRUD endpoint, scaffolding, a refactor with existing tests as a
  safety net.
- **Stronger model** for anything where a wrong call is expensive to undo: schema
  migrations with a data cutover, auth/security surfaces, a change that touches code
  several other in-flight tasks depend on, or any task whose "done" criteria is more than
  "the build is green" (data parity after a migration, a security invariant, a contract
  three other modules rely on).

Rule of thumb: if a mistake could corrupt data or open a security hole, it goes to the
stronger model — everything else defaults to the faster one, because parallel fast workers
collapse wall-clock time far more than a single strong model working serially.

## Task decomposition into waves

Work is grouped into dependency-ordered "waves." Tasks in the same wave touch disjoint
modules and run concurrently; a task only starts once everything it depends on has
already landed on the integration branch.

```
Wave 0 (solo):        schema + backfill         ← foundation, blocks everything
Wave 1 (parallel):    per-user scoring ‖ auth backend
Wave 2:               LLM-call logging, then the read-cutover to the new tables
Wave 3 (parallel):    personal web feed ‖ profile UI ‖ CV-parser wiring
Wave 4:               Telegram account linking, multi-model routing
Wave 5:               analytics dashboard, in-Telegram mini-app
```

The chain steps (schema → scoring → cutover) are strictly sequential because they share
one processor and one set of tables. Everything alongside that chain — auth, UI, the
profile editor — is a separate module family and runs in its own lane.

## Isolation: one worktree per task, no exceptions

**Every parallel task runs in its own `git worktree` on its own branch.** This is a hard
rule, not a "only if the files might collide" judgment call — a full day of finalize work
was lost early on because two agents shared one checkout and silently stomped on each
other's uncommitted changes. The fix that stuck:

```bash
git fetch origin
git worktree add /tmp/job-radar-<task-id> -b feature/<task-id> v2-multiuser
cd /tmp/job-radar-<task-id>
# every command for this task runs from here — never back in the main checkout
```

## Closing one task: four steps, always in this order

1. **Implement.** The task prompt goes into a fresh chat. The agent writes code and
   tests, runs the build, the full test suite, and lint, and reports back. **It does not
   commit.**
2. **Review.** In the same chat (or a dedicated reviewer pass on the diff), findings get
   fixed before anything is staged.
3. **Verify.** The task's own "done" criteria — a specific grep, a curl round-trip, a row
   count in the database — gets checked by hand, not taken on the agent's word.
4. **Commit.** Only the orchestrator stages files, writes the commit message, and merges
   into the integration branch.

Invariant enforced after every single task, no exceptions: build, full test suite, and
lint are green before it's considered closed. Because workers never commit, commit
messages stay in one consistent voice and every change gets a second set of eyes before
it lands — a deliberate gatekeeper step, not friction for its own sake.

## What a task prompt actually contains

Every prompt is self-contained — the worker never sees the orchestrator's chat, so
nothing can be assumed. A trimmed real example, from the task that fanned scoring out
per-user:

```
You're working in this NestJS repo. Read AGENTS.md first and follow it.
Branch: git checkout v2-multiuser && git pull && git checkout -b feature/scoring-fanout

TASK — move scoring to a per-user fan-out (currently it scores once against a single
hardcoded profile).

DO:
- scoring-queue.service.ts: enqueue one job per active user per vacancy;
  jobId = `score-<userId>-<vacancyId>`.
- scoring.processor.ts: load that user's profile, score against it, upsert into
  UserMatch (unique on userId+vacancyId); skip if a match already exists.
- scoring.service.ts: accept the profile as a parameter instead of reading a file.
- Update the affected specs.

DONE WHEN: a run produces a UserMatch row for the existing user, behavior is otherwise
identical to before, build + full test suite + lint are green.

Do not commit. Report back: files touched, how the job contract changed, test output.
```

Every prompt follows the same shape: current state on HEAD, invariants that must not
break (especially in modules other tasks are touching concurrently), the exact contract
(types, signatures, endpoint names), the done criteria, and an explicit "don't commit."

## Guardrails

A short list of things worker agents are never allowed to do, restated in every
orchestrator bootstrap because the cost of getting them wrong is high: force-push to the
integration branch without explicit sign-off, delete a branch that might hold unmerged
work, `git reset --hard` anywhere a worker's uncommitted work might live, or touch the
stable branch directly. When an agent is uncertain about the current state, the rule is
to check `git log` and the database directly rather than trust a document that might have
drifted — docs describe intent, git and the running system describe reality.

## Why this is worth doing instead of one long chat

A single long-running chat degrades: context gets diluted across unrelated modules, and
everything serializes. Splitting into self-contained, reviewed, single-purpose tasks run
in parallel worktrees keeps each agent's context narrow (better output per task) while
collapsing wall-clock time — and the human-gated commit step means the git history reads
as one coherent narrative instead of a hundred small agent-authored fixups.
