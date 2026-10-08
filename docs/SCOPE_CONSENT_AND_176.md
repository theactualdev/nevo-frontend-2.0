# Scoping: the consent re-sequence, and SCRUM-176

22 Sep 2026. Design repo pulled to `3d51a3f` — two drops since Friday, and
nothing built last week was against the current frames.

---

## 1. Consent moved to entry. It is a re-sequence, not a re-skin.

**Read the flow index first**, as instructed, and it is the flow documents that
carry the change rather than the new screen.

| Before | Now |
|---|---|
| The Close → **Consent Gate (14)** → PIN Creation | The Close → **PIN Creation** |
| Gate polled D.1b status until confirmed | **No polling anywhere** |
| A child sat the whole assessment, then met the gate | **An unconsented child never reaches the assessment** |

Frame 31, in its own words: *"Consent is checked at entry, before the sequence —
never here."* And: *"an unconsented student never reaches the assessment or any
lesson; the link holds at Waiting on Consent (00d) until consent is in, then
opens straight to the assessment."*

### What 00d is, and what it deliberately is not

*"Says Nevo isn't ready, says it will be soon, nothing more. No progress, no
countdown, no refresh, no door held shut. When consent arrives, opening the link
again goes straight to the assessment — no action needed."*

Copy is exactly two lines: **"Nevo isn't quite ready for you yet"** /
**"It will be soon."** Primary case is the shared classroom tablet at 768×1024.

**The no-polling instruction is the substantive change and it is easy to miss.**
The old gate polled; this screen must not. A child is not kept waiting at a
spinner for a decision an adult makes on another day — they close the link and
come back. Anything that re-checks on a timer re-creates the screen this
replaces.

### What this costs us

**Almost nothing is being removed.** There is no consent-gate route in the app
today — no `src/app/student/onboarding/consent`, no screen 14 component. The old
gate exists only as a mention in `ObservedInteractionSequence`'s comments. So
SCRUM-171's "removal" is largely bookkeeping, and the real work is greenfield.

**The endpoint already exists and is already wrapped.**
`GET /api/v1/students/me/consent-gate` returns
`{ studentId, granted, blocked, requiredType, status }` — all five required —
and `useConsentGate` already reads it. What the hook exposes today is
`withdrawn`, consumed by `ProfilingFlow` and `WarmUpRun` to stop a run
mid-flight. Entry needs the other half: `granted`/`blocked` **before** the first
screen.

**Estimate: S–M.** One screen, one routing decision at the entry point, and a
guard that must run before the sequence mounts rather than inside it.

### Two things to settle before building

1. **Which entry point.** A child arrives by join link (`?token=`), by PIN
   unlock, and by the 28c picker. The frame says "a student's link routes here",
   which is the join link — but a *returning* unconsented child signing in with
   a PIN is the same person in the same state. If 00d is only on the link, that
   child reaches the app another way.
2. **Consent is per child, and the tablet is shared.** The 28c picker remembers
   six children. `consent-gate` is `students/me`, so the answer depends on who
   signed in — which means the check cannot happen before the picker, only
   after. Worth confirming that is the intended order.

---

## 2. SCRUM-176 — blocked on SCRUM-175, so this is scope only

**Lydia's diagnosis is the right one and the code confirms it.**
`ProbeQuestion` is `{ context?, picture?, question, options[], answer }` —
**there is no difficulty field**, so there is genuinely no harder or easier to
move to. That is why difficulty updating from real responses belongs in 175
rather than as a static rating: a static rating would be a number we invented,
and the thing that makes an item harder is how children actually answered it.

### What is actually there, counted

| Band | Items |
|---|---|
| `p13` | 3 |
| `p46` | 4 |
| `jss` | 4 |
| `ss` | 4 |
| **Total** | **15** |

**Fifteen, not sixteen.** Either an item is missing from `p13` — which has
three where every other band has four — or the ticket's count is approximate.
Worth resolving before anyone reconciles against the server's set.

### The three pieces of work

1. **Drop the items and the answer key.** `PROBE_QUESTIONS` is ~180 lines of
   authored content plus `ICONS`. The `answer` index is used in exactly one
   place: `DomainProbeModule.tsx:307`, `correct: i === q.answer`.
2. **Ask the server per question.** No endpoint exists yet — I checked all 192
   paths and nothing matches assessment, probe, question or item. That is
   SCRUM-175's to create, which is why this is blocked rather than slow.
3. **A state for a subject with nothing to serve.** New, and it needs copy.

### The part worth naming: this takes marking off the device

`correct: i === q.answer` is the frontend deciding whether a child was right.
Every other marking path in the app already routes through the server or
through a single shared marker for exactly this reason, and rule 3 says the
frontend computes no scores. Serving per question moves that judgement to the
side that owns it, and the answer key stops shipping to the device at all —
which is also the only way an item bank stays worth anything.

### What the frontend needs from 175 to size this properly

- **The question shape**, including whether `picture`/`context` survive and
  whether icons come as identifiers or markup. Today they are inline SVG
  strings in the client.
- **How a response is sent and what comes back** — whether the client learns
  `correct` at all, or only that the next question is ready. If it does not
  learn, the "not sure" decline and the accuracy denominator both move server
  side too, and `reduceTrialModule` stops being ours.
- **What "nothing to serve" looks like on the wire** — an empty list, a 404, or
  a status. It decides whether the new state is an empty-state or an error
  state, and those are different screens.

**Estimate once unblocked: M.** The module already has the trial-runner shape
and emits `trial_pick` with `correct` in `...detail`; most of the change is
where the questions come from and who marks them.

---

## 3. One thing that got more urgent

`docs/BASELINE_EVENTS.md`, written that day and citing the reducers line by line,
is what Teslim asked for. It unblocks two things rather than one: SCRUM-175/176
and the baseline reduction are the same server-side move, and the server cannot
own a reduction without knowing what the device emits.

**Since 6 Oct that page describes something else.** The server owns the
reduction now: the device sends raw trials to `POST /api/baseline/trials` (B9),
the reducers it cited are gone, and the page describes the trials instead.
