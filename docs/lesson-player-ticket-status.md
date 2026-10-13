# Lesson Player — Ticket Status (Product Arch B.7 · Frontend Arch §4)

**Ticket:** *"As a student, I experience a single unified lesson player that
adapts to how I learn, not four separate modality screens."*

**Status:** **Shell + structure delivered (Slices 0–6); not fully satisfied.**
The unified player, all four modalities, adaptive density, comprehension check +
assessment, completion/leave/system-states, signal instrumentation, and the
calculation co-construction solver are built and verified. Three requirements
have **remaining frontend work**, and the "adapts per my profile" spine is
**backend-blocked** (the player renders a static mock plan today).

Audited clause by clause against the shipped code.

---

## Requirements coverage

| Requirement | Status | Where / notes |
| --- | --- | --- |
| Single unified player, not four screens | ✅ Met | One `LessonPlayer`; four modalities in one shell |
| Adaptive toggle bar (Simplify/Expand/Slower), two visual states (manual vs system) | ⚠️ Partial | Component supports both looks; the player only ever sets `manual`/`default` — the **system-triggered** (violet) state is never fired live |
| Dynamically layered primary + secondary channels per profile | ⚠️ Partial / ambiguous | Only the calc solver *layers* (audio over interactive). General segments alternate + offer one suggestion. Hinges on what "layered" means — see handoff |
| Comprehension checks that adapt format by profile (audio Q for reading difficulty, text for strong readers) | ❌ Not built | `QuickCheck` is text-only; no audio-question variant exists (not in the type). Clearest miss |
| Anxiety-sensitive feedback framing | ✅ Met | Never red, system-owns-failure, warm recovery, "progress is saved", no scores — throughout |
| Leave-lesson confirmation, preserves progress, captures exit as a signal | ✅ Met | `LeaveLessonDialog` + `exit_attempt` fires on open |
| Lesson completion **and summary** screens | ⚠️ Partial | Completion built; **summary** unwired (screen 18, unbuilt) |
| All signal events fire continuously to the backend | ⚠️ Partial | Frontend fires + batches continuously (5s / 20 / on-exit) with offline re-queue; **no backend** — `submitBatch` 404s and re-queues |

## Built and verified (Slices 0–6)

Types + mock · player spine (top bar, progress, reading column, chevron nav) ·
Text/Visual/Audio/Interactive modalities · adaptive density · system modality
suggestion (1-per-segment, never consecutive) · inline Quick Check (navy correct
/ violet recovery, retry, "see it explained") · after-lesson assessment (growth
result, no score) · completion + leave dialog · loading/error (Next conventions)
+ offline banner · signal instrumentation (`time_on_segment`, `scroll`,
`simplify_trigger` / `expand_trigger` / `slower_trigger` - the child's own ask,
`{segmentId}` and no source - `comprehension_response`, `exit_attempt`, `replay`) ·
typed `LessonContext`/`useAdaptation` · calculation co-construction solver
(scaffold + equation assembly + step machine + audio + kinesthetic).

## Remaining frontend work (not backend-blocked)

Detail + current status in **`BUILD_STATUS.md`**.

1. **Audio-question comprehension format** — build a `QuickCheck` format variant
   + an audio-question renderer (the clearest ticket miss). *Which* format to
   serve is profile-driven (backend); the render capability is ours.
2. **Live system-triggered toggle state** — fire the violet "system" look when a
   density change is system-driven (currently always `manual`).
3. **Summary screen** — the completion "See summary" hand-off, pending screen 18.
4. **Layered channels (only if "simultaneous" is intended)** — a compositor so a
   general segment can present two channels at once, as the calc solver does.
   Gated on the design clarification.

## Backend-blocked (the "per my profile" spine)

- **Profile → adaptation wiring.** The lesson page passes a **static mock** plan
  (`getMockAdaptation`) to the player; `useAdaptation` is typed but not wired.
  There is no `profile → useAdaptation → plan` flow, so no adaptation is
  observable — the player faithfully renders a fixed plan. When the contract
  lands this is a thin swap, and it also drives (1) and (2) above.
- **Signals reaching a backend.** As above — firing is built; the endpoint is not.

## Design decisions outstanding

Eight items (manual modality switcher, "See summary"/"Review answers" targets,
calc back-chevron, calc audio/kinesthetic enabling, progress-track colour,
inert density toggle, feedback copy) — consolidated in
**`BUILD_STATUS.md`**.
