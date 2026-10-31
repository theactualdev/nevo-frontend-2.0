# Nevo Frontend — Docs

Tracked, shareable project documentation. Everything in this folder is committed
to the repo, so the whole team (and CI) works from the same reference.

> **Source specifications are local-only.** The authoritative specs — Complete
> Product Architecture, Frontend Architecture, UI/UX Specification, and the Nevo
> Design System — are distributed as PDFs and contain commercially sensitive
> material (pricing, partners, go-to-market). They live in `context/`, which is
> **gitignored**, and are deliberately not committed. This folder holds the
> non-sensitive, buildable distillations of those specs.

## Contents

- **[architecture.md](./architecture.md)** — Frontend architecture reference:
  stack, project structure, route tree, component organization, hooks, API
  client, state management, design tokens, and auth. The practical "how this
  codebase is organized and why" document, including the key decisions made
  along the way.

### Ticket status

- **[onboarding-ticket-status.md](./onboarding-ticket-status.md)** — B.2
  onboarding: clause-by-clause coverage. Frontend-complete; only backend-blocked
  gaps remain.
- **[lesson-player-ticket-status.md](./lesson-player-ticket-status.md)** — B.7
  lesson player: coverage across Slices 0–6, remaining frontend work, and the
  backend-blocked adaptation spine.
- **[BUILD_STATUS.md](./BUILD_STATUS.md)** — what is left across all five
  surfaces, sorted into what we can build now, what needs backend, and what
  needs design. Replaces the old `blocked-items-handoff.md`, whose contracts
  had all since shipped.

### Releases

- **[deploy-order.md](./deploy-order.md)** — a stricter backend check never
  goes live before the client sends the format it demands (Lydia, 31 Oct 2026),
  and the order that keeps it true.

### Planning

- **[student-daily-experience-epic.md](./student-daily-experience-epic.md)** —
  the "student daily experience" ticket (B.4–B.11) split into buildable per-screen
  stories, with scope decisions and data dependencies flagged.

## Conventions

- Docs are Markdown and kept in sync with the code as it evolves.
- Commercially sensitive material never goes here — it stays in `context/`.
- Git workflow rules live in `context/git-guidelines.md` (local-only for now).
