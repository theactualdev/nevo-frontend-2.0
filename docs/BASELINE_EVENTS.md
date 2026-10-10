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
probeItemId, skipped }`. Five kinds of answer become one; the rest of the
stream is timing anchors, the run's context (section 3), or stays on the device.

| Answer | `dimension` | `condition` | `response` | `correct` | `responseTimeMs` |
|---|---|---|---|---|---|
| a tile recall (Module 1, warm-up `wmc`): its `tap`s, ended by a wrong tap or `round_complete` | `wmc` | `length_N` | the cells tapped, in order, comma-separated | `false` if a wrong tap ended it, `true` at `round_complete` | from the grid being handed over to the tap that ended it |
| `check_answer`, the SS dual task (Module 1, and the SS warm-up's tile round) | `wmc` | `dual_check` | `"true"` / `"false"` | whether the answer was right | from the check appearing |
| `trial_pick` (Modules 2-4, warm-up) | from the `act`: `pattern` is `ps`, `flanker` `attention`, `reading` `reading`, `dots` `ans`, `probe` `domain`; the warm-up's acts are already dimensions | `congruency`, `pair`, `ratio_N`, the reading `mode`, or the probe's `subject` | the choice's index, or a served option's `value`; `not_sure` for a decline | where the activity holds the answer, else `null` | from the moment the child could answer (the dot mask, the end of a heard sentence) |
| `motor_tap`, the motor-speed step | `motor_speed` | `practice`, or `null` | the target | `null` | the latency the step measured |
| `motor_end` with reason `idle`, the target left untapped for ten seconds | `motor_speed` | `practice`, or `null` | `null` | `null` | `null`, and `skipped: true` |

`probeItemId` is the served item's id when the engine served one and it is a
UUID, as the contract requires, and `null` otherwise. The server marks a served
pick against its own key. A served item is a probe-bank UUID; a device-task
day's id is in the `device:*` namespace with `served: false` (B79, B81), and is
never shown as a question or sent as a probe item.

**One trial per completed recall (B80, 8 Oct).** A recall's taps are one
answer, not one each. A recall the child never finished (the stream ends part
way through it) sends nothing.

`skipped` is sent only on that last row: the one trial the capture records as
put in front of the child and not answered. Absent is the contract's `false`.
A "Not sure" is an answer, not a skip, and an activity the device could not
present (P1-3's heard reading with no voice) was never in front of anyone.

Anchors only: `input_start`, `check_shown`. Read for the
run's context (section 3): `run_start`, `warmup_start`, `motor_end`,
`motor_skipped`. Never sent: `trial_shown`, `response_open`, `playback_start`,
`module_end`, `replay`, `probe_subject`.

### Properties the trials keep

- **A recall's time is never measured across a round.** It runs from its own
  hand-over to the tap that ended it, and a wrong tap ends the recall.
  Pairing across rounds once swallowed the between-round beat and the whole
  next playback into one "gap".
- **"Not sure" is a decline, not a miss**: `response: "not_sure"`,
  `correct: null`.
- **No answer key means no accuracy**: `correct` is `null`, never `false`.
- **An answer given before it could be** (a heard sentence still playing) has
  `responseTimeMs: null`, not a number nobody measured.
- **Times are whole milliseconds, 0 to 600000.** Anything outside is `null`
  rather than clamped, so one bad reading cannot 422 the run.

## 3. The run's context, beside the trials

Since B76 (8 Oct) `BaselineTrialsRequest` is `{ sessionId, ageBand, formFactor,
motorStepSkipped, trials }`. `baselineRunContext` reads the three from the
capture, and a key the run did not record is left out.

| Key | From | Values |
|---|---|---|
| `ageBand` | the band on `run_start` or `warmup_start` | `p13`, `p46`, `jss`, `ss` as `early_primary`, `upper_primary`, `junior_secondary`, `senior_secondary` |
| `formFactor` | `formFactor()`, read when the run starts | `mobile`, `tablet`, `desktop` as `mobile_touch`, `tablet_touch`, `desktop_cursor` |
| `motorStepSkipped` | `motor_skipped` (true) or `motor_end` (false) | onboarding only |

- **The warm-up** has no motor step, so it never sends `motorStepSkipped`. With
  no roster band it runs Primary 4-6's version as a default and sends no
  `ageBand`: the default is the task's size, not the child's age band.
- **An onboarding run** always has a band (the roster, the Step 1 age, or the
  intro's question), and records whether the motor step ran or was skipped.
- **A run parked before B76** has no context and is sent without one.

## 4. What is not sent, and why

- **Coordinates.** Raw touch stays on the device (B14).
- **The motor skip's reason.** There is one (`cursor`), and it is the form
  factor already.
- **The run's length**, and the intervals between the taps inside a recall.
- **Identity and wall-clock time.** The request carries the session; the
  trials carry interactions.

## 5. Where the trials go, and when

- **The onboarding run** has no account yet, so it parks its trials on the
  device (`holdBaseline`), with its context. `flushPendingBaseline` sends them once the account
  exists and is provably this child's, and only then is `baseline_submitted`
  tracked.
- **The daily warm-up** sends at once (`baselineApi.submitTrials`: three
  attempts, a 4xx not retried) and parks under the child's id if that fails.
  A served question's pick also goes to
  `POST /api/baseline/recalibrate-prompt/{id}/response` as `{ itemId, value }`
  (B8). On a day with no served question, a completion with no item goes there
  instead (B54).
- A parked run older than seven days is dropped, not sent.

## 6. The markers on the `profiling` signal stream

| Event | Payload |
|---|---|
| `baseline_module_start` | `{ moduleId }`: `grid_span`, `pattern_flanker`, `sentence_dot`, `domain_probe` |
| `baseline_module_complete` | `{ moduleId }` |
| `baseline_submitted` | `{}` |

These are exactly the keys the catalogue declares
(`src/lib/api/signals.catalogue.json`, from `GET /api/signals/catalogue`).
