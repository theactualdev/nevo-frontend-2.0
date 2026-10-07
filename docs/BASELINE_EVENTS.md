# The baseline: what the device captures and what it sends

Rewritten 6 Oct 2026. Since B9 (5 Oct) the device sends a run's **trials**, one
per answer, to `POST /api/baseline/trials`, and the server does every
reduction. The reducers and the feature vector this page used to describe are
gone, and nothing calls `POST /api/baseline/submit` any more. Read the code
before this page: `src/lib/profiling/capture.ts` (`baselineTrials`) is the
mapping, and `BaselineTrial` in the live spec is the contract.

---

## 1. The raw stream stays on the device

`BaselineCapture` records every interaction as `{ kind, t, payload }`, where
`t` is `performance.now()` at the moment it happened (rule 4). The stream is
held in memory and IndexedDB and is never sent. When the run ends it is turned
into trials, and then purged, whether or not the trials were delivered.

A withdrawn guardian `stop()`s the capture: nothing more is recorded, no trials
are taken, and nothing is sent or parked.

Tap coordinates (`x`, `y`) are recorded and stay here (B14). A trial has no
field for them.

## 2. What becomes a trial

`BaselineTrial` is `{ dimension, condition, response, correct, responseTimeMs,
probeItemId }`. Four kinds of event become one; the rest of the stream is
timing anchors or stays on the device.

| Event | `dimension` | `condition` | `response` | `correct` | `responseTimeMs` |
|---|---|---|---|---|---|
| `tap`, a tile (Module 1, warm-up `wmc`) | `wmc` | `length_N` | the cell | whether it was the right tile | from the grid being handed over, or from the previous right tap of the same recall |
| `check_answer`, the SS dual task | `wmc` | `dual_check` | `"true"` / `"false"` | whether the answer was right | from the check appearing |
| `trial_pick` (Modules 2-4, warm-up) | from the `act`: `pattern` is `ps`, `flanker` `attention`, `reading` `reading`, `dots` `ans`, `probe` `domain`; the warm-up's acts are already dimensions | `congruency`, `pair`, `ratio_N`, the reading `mode`, or the probe's `subject` | the choice's index, or a served option's `value`; `not_sure` for a decline | where the activity holds the answer, else `null` | from the moment the child could answer (the dot mask, the end of a heard sentence) |
| `motor_tap`, the motor-speed step | `motor_speed` | `practice`, or `null` | the target | `null` | the latency the step measured |

`probeItemId` is the served item's id when the engine served one and it is a
UUID, as the contract requires, and `null` otherwise. The server marks a served
pick against its own key.

Anchors only: `input_start`, `round_complete`, `check_shown`. Never sent:
`run_start`, `warmup_start`, `trial_shown`, `response_open`, `playback_start`,
`module_end`, `replay`, `probe_subject`, `motor_end`, `motor_skipped`.

### Properties the trials keep

- **A recall's time is never measured across a round.** A tap is timed from
  the previous right tap of the same recall, and a wrong tap ends the recall.
  Pairing across rounds once swallowed the between-round beat and the whole
  next playback into one "gap".
- **"Not sure" is a decline, not a miss**: `response: "not_sure"`,
  `correct: null`.
- **No answer key means no accuracy**: `correct` is `null`, never `false`.
- **An answer given before it could be** (a heard sentence still playing) has
  `responseTimeMs: null`, not a number nobody measured.
- **Times are whole milliseconds, 0 to 600000.** Anything outside is `null`
  rather than clamped, so one bad reading cannot 422 the run.

## 3. What is not sent, and why

- **Coordinates.** Raw touch stays on the device (B14).
- **The age band** the run was sized for. A trial has no field for it, and the
  catalogue declares no `band` on `baseline_module_start` either. Backend is
  asked where it goes (B76).
- **The run's length**, and a recall's full timing beyond one interval per tap.
- **Identity and wall-clock time.** The request carries the session; the
  trials carry interactions.

## 4. Where the trials go, and when

- **The onboarding run** has no account yet, so it parks its trials on the
  device (`holdBaseline`). `flushPendingBaseline` sends them once the account
  exists and is provably this child's, and only then is `baseline_submitted`
  tracked.
- **The daily warm-up** sends at once (`baselineApi.submitTrials`: three
  attempts, a 4xx not retried) and parks under the child's id if that fails.
  A served question's pick also goes to
  `POST /api/baseline/recalibrate-prompt/{id}/response` as `{ itemId, value }`
  (B8). On a day with no served question, a completion with no item goes there
  instead (B54).
- A parked run older than seven days is dropped, not sent.

## 5. The markers on the `profiling` signal stream

| Event | Payload |
|---|---|
| `baseline_module_start` | `{ moduleId }`: `grid_span`, `pattern_flanker`, `sentence_dot`, `domain_probe` |
| `baseline_module_complete` | `{ moduleId }` |
| `baseline_submitted` | `{}` |

These are exactly the keys the catalogue declares
(`src/lib/api/signals.catalogue.json`, from `GET /api/signals/catalogue`).
