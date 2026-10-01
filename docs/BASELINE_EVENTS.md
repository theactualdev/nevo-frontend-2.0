# The baseline event list

For Teslim, 22 Sep 2026. Everything below is read out of the code rather than
described from memory — every `kind` and every payload field here has a
`capture.record(...)` call behind it, cited by file and line.

**Why it is wanted now.** SCRUM-175/176 and the baseline reduction are the same
server-side move, so this list unblocks both: the server cannot own the
reduction without knowing what the device actually emits, and 176's
per-question serving needs the same response shape the trial events already
carry.

---

## The shape every event has

`src/lib/profiling/capture.ts`

```ts
interface CaptureEvent {
  kind: string;                        // the names in the table below
  t: number;                           // performance.now() at the interaction
  payload?: Record<string, unknown>;
}
```

`t` is **`performance.now()`, never `Date.now()`** — rule 4. It is a monotonic
reading taken at the moment of the interaction, so every *within-run* difference
is the difference of two monotonic readings and survives a device clock
correction mid-run. It is not a wall-clock time and cannot be turned into one.

**Raw streams never leave the device today.** They are held in IndexedDB (with
an in-memory fallback), reduced to a feature vector on completion, submitted to
`POST /api/baseline/submit`, and purged after transmission. If the reduction
moves server-side, that purge guarantee moves with it and becomes a
transmission question rather than a local one — flagged, not assumed.

---

## Every event the run emits

| `kind` | Payload | Emitted by |
|---|---|---|
| `run_start` | `{ band }` | `ProfilingFlow.tsx:187` |
| `warmup_start` | `{ dimension, itemId? }` - `itemId` only when the engine's served question is the one shown | `WarmUpRun.tsx` |
| `trial_shown` | `{ module, act, trial }` | `useTrialRunner.ts:51` |
| `response_open` | `{ module, act, trial, openAfterMs }` - the dot mask landed, or the heard sentence ended | `useTrialRunner.ts` |
| `trial_pick` | `{ module, act, trial, choice, rtMs, openAfterMs?, beforeOpen?, x?, y?, ...detail }` | `useTrialRunner.ts` |
| `trial_pick` (warm-up) | `{ module: "warmup", act, choice, rtMs, ...detail }` | `WarmUpRun.tsx:279` |
| `module_end` | `{ module }` | `useTrialRunner.ts:69`, `GridSpanModule.tsx:124` |
| `playback_start` | `{ length, litMs, gapMs }` | `GridSpanModule.tsx:141` |
| `input_start` | `{ length }` | `GridSpanModule.tsx:162`, `:186` |
| `tap` | `{ cell, correct, posInSeq, length, x?, y? }` | `GridSpanModule.tsx` |
| `tap` (warm-up) | `{ module: "warmup", act: "wmc", cell, correct, posInSeq, length }` | `WarmUpRun.tsx:514` |
| `round_complete` | `{ length }` | `GridSpanModule.tsx:207`, `WarmUpRun.tsx:535` |
| `check_shown` | `{ check }` | `GridSpanModule.tsx:159` |
| `check_answer` | `{ check, answer, correct, x?, y? }` | `GridSpanModule.tsx` |
| `replay` | `{ module: "sentence_dot", trial }` | `SentenceDotModule.tsx:263` |
| `probe_subject` | `{ subject, x?, y? }` | `DomainProbeModule.tsx` |

### Timing and position, added 1 Oct

- **`rtMs` starts when the child can answer.** For the dots that is the mask,
  for the heard P1-3 sentence the end of speech; `openAfterMs` on the pick is
  the offset from presentation. An answer given before the sentence ended
  carries `rtMs: null` and `beforeOpen: true` - there is no honest number for
  it - and the reducer leaves a missing time out of the mean.
- **`x`, `y`** are viewport coordinates of the tap, unrounded (frontend §2,
  §3). A keyboard press records neither rather than a false 0,0. No reducer
  reads them yet; they are in the stream for when the stream travels.
- **The warm-up's served question** goes up on the feature as
  `item: { itemId, chosenOption }`, unmarked - the device holds the answer key
  and does not use it.

### Vocabularies

- **`module`**: `grid_span`, `pattern_flanker`, `sentence_dot`, `domain_probe`,
  `warmup`
- **`act`** (the phase within a module): `pattern`, `flanker`, `dots`,
  `reading`, `probe`, and `wmc` for the warm-up's working-memory dimension
- **`band`**: the age band the run was built for
- **`choice`**: the index of the control tapped, not its label

### `...detail` — the per-module extras on `trial_pick`

These are merged in at the call site and are the fields a reduction actually
needs, so they are worth reading as part of the contract rather than as extras:

- `correct: boolean` — **only present when the trial had an answer key.** It is
  the accuracy denominator: `reduceTrialModule` counts `scored` as the trials
  where `typeof correct === "boolean"`, so a trial without a key is never
  counted wrong.
- `pair: "same" | "different"` — pattern-match trials
- `congruency: "congruent" | "incongruent" | "neutral"` — flanker trials.
  Absent for P1-3, whose flanker task draws the centre arrow alone.
  Without it the vector said how *fast* a child answered an interference trial
  and never whether the flankers had captured them.

---

## Three things that will bite a server-side reduction

These are all bugs we have already hit and fixed locally. They are properties
of the data, not of our code, so they will recur in any reimplementation.

**1. Recall gaps must be paired within one round, not across rounds.**
`reduceGridSpan` pairs consecutive correct taps to measure recall speed. Pairing
across a round boundary swallows the between-round beat, the playback lead and
the whole next sequence lighting up — several seconds against a real
within-round gap of a few hundred milliseconds. `posInSeq` counts up within a
recall and resets to 0 on the next, so a pair is genuine exactly when it
advanced by one. A 30-second sanity ceiling does **not** catch this.

**2. `notSure` is a decline, never a wrong answer.** It is counted separately
and must not enter the accuracy denominator.

**3. A trial with no answer key has no accuracy.** `correct` is absent, not
false. Treating absent as wrong scores a child down for a trial nobody could be
wrong about.

---

## Two things that are NOT in this list, deliberately

**No identity.** No name, no login identifier, no school code, no class. The
submission carries the session; the events carry interactions.

**No wall-clock timestamps.** See `t` above. If the reduction needs to know
*when* a run happened rather than the intervals within it, that is a field on
the submission, not on an event — and it is a question worth asking explicitly
rather than deriving.

---

## One open question, and it is ours rather than yours

ISO 8601 bottoms out at 1ms. Tap dwell, response latency and idle all live at
100ms and up, so 1ms reads as ample. **If affective inference needs finer than
that, it is a contract ask for a numeric monotonic field** — and the per-session
anchor we date signal events from becomes its origin rather than its
replacement. Raised 17 Sep, still open, and it belongs to whoever owns the
engine rather than to backend.
