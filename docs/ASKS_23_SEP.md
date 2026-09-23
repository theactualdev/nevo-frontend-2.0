# The asks, 23 September 2026

Written after re-deriving the student list against the deployed spec
(`217 → 225 paths, 395 → 406 schemas` since the 21 Sep re-probe). Every claim
below was read out of the spec or the source today, not carried forward.

Three recipients, three messages, meant to be sent as they are.

---

## 1 · Backend (Teslim)

**Two contradictions, then the standing asks.**

### 1a. `ProactiveAction` does not match what the frontend applies — blocking

The enum landed and it is five values:

`simplify` · `slower` · `expand` · `offer_hint` · `show_socratic_panel`

`ADJUSTMENT_ACTIONS` in our `constants/affect.ts` is six, and different:

`no_action` · `modulate_density` · `increase_difficulty` · `offer_hint` ·
`offer_break` · `show_socratic_panel`

**Only `offer_hint` and `show_socratic_panel` overlap.** What that means right
now, in the deployed client:

- `modulate_density` and `offer_break` are **built, shipped on 17 Sep, and can
  never fire** — nothing will ever send them.
- `simplify`, `slower` and `expand` **arrive and are dropped**. Unrecognised
  values resolve to null and the interface does nothing. That fall-through is
  deliberate — absence is an instruction — which is why no gate has complained
  and why this could have run for weeks unnoticed.

**What we need:**

1. Is `ProactiveAction` the complete and authoritative list, or a partial one?
2. If complete — is there still an engine instruction meaning **"offer a
   break"**? It is in the architecture document and it is built; it is not in
   the enum.
3. Does `simplify` carry what `modulate_density` carried, or are they different
   instructions that happen to sit next to each other?

**We are not building against either vocabulary until this is answered.**
Renaming ours to match is a one-line change; doing it on a guess would silently
repoint a shipped behaviour at the wrong instruction.

### 1b. The PIN length is inconsistent within the spec itself

| schema | constraint |
|---|---|
| `PinChoice` (student-entry) | `minLength 4`, `maxLength 8`, `^\d+$` |
| `JoinRequest.pin` | no pattern |
| `UnifiedLoginRequest.pin` | no pattern |
| `PinLoginRequest.pin` | `^\d{6}$` |
| `PinUpdateRequest.pin` | `^\d{6}$` |

**The creation doors were relaxed and the unlock door was not.** A child can now
be given a four-digit PIN at entry and then be refused on every subsequent
sign-in with a 422 — and our failure classifier maps anything that is not
401/403 to "our fault", so they are told *"we couldn't check that just now"* and
never learn why.

Design settled on four digits on 21 Sep. **The ask: relax `PinLoginRequest` and
`PinUpdateRequest` to match `PinChoice`.** Until then `STUDENT_PIN_LENGTH` stays
at 6 on every screen, because six is the only length that works end to end.

### 1c. Standing asks, re-derived today

- **`module_boundary_action`** — the only one of the five break and boundary
  signals still missing. The other four landed, and the consolidation break can
  now report what a child answered, which it could not before.
- **A per-question attempt store.** `scaffolds/attempt` is a scaffold decision,
  not an answer record. "Review answers" still works only in the tab the child
  answered in.
- **Baseline and warm-up items.** `BaselinePromptResponse` is still
  `{dimension}`, so every stimulus is hardcoded and the daily warm-up asks the
  same question each time that dimension comes round.
- **A boundary field on `AskResponse`.** `SignalEventType` gained
  `ask_nevo_cannot_help` and `ask_nevo_redirect_used`, so we can now *report* a
  handoff — but nothing on the answer *triggers* one. `questionCategory`
  (`lesson_help`, `profile_pattern`, `class_planning`, `family_message`,
  `flag_review`, `general`) is a topic, not a refusal.
- **An SSO vendor.** `SsoStartRequest` needs `provider`;
  `SchoolCodeResponse.authMethod` names only the method. Children at an SSO
  school cannot sign in.
- **`currentPin` on `PinUpdateRequest`.** Frame 27 draws three steps beginning
  with the current PIN; no such field exists anywhere.
- **A plain-language lesson description.** The preview sheet's description has
  no field on any lesson schema.

### 1d. Landed, and worth saying so

`sessionId` now comes back on `GET /students/{id}/sessions` — that closes a
blocker open since the first survey, and it closes the teacher lane's
equivalent on the same paths. Four of the five break and boundary signals
landed. The scaffold endpoints are fully specified, with the decision on your
side and `studentMessage` written by you, which is the right division.
`/api/v1/student-entry` is exactly the shape the consent re-sequence needed.

---

## 2 · Design

### 2a. The fourth time the wire and the design describe different products

After the third you asked to be told as an inference, before either side gets
built. **This is that, and it is flagged as an inference.**

On 17 Sep you split pace control into **Simplify / Expand / Slower**. The engine
has now published its instruction vocabulary and it is
`simplify`, `slower`, `expand`, `offer_hint`, `show_socratic_panel` — your three
names, exactly.

The frontend was built to a different list, and only two values overlap. So in
the deployed client today: **the density treatment that shipped on 17 Sep can
never be triggered, and neither can the break.**

Two questions are yours rather than backend's:

1. **Is `simplify` the engine instruction that the 17 Sep Simplify control was
   meant to serve?** If it is, Simplify stops being only a text reshape blocked
   on `textVariant` and becomes an engine instruction applied to the live
   screen — a different and smaller piece of work, and possibly an unblocked
   one.
2. **Is there still meant to be an engine-initiated break?** `offer_break` is in
   the architecture document and it is built. It is not in the contract's list.

### 2b. Consent at entry — one of my two questions is answered

`GET /api/v1/student-entry/{token}` resolves from the **token, not a session**,
and returns `consentState: given | pending`. So the check can run before
anything mounts, which is what "checked at entry" requires, and it is a single
resolve, which is what "no polling" requires.

**That answers question 1: the entry point is the link.**

**Question 2 stands.** A returning unconsented child signing in by PIN is the
same person in the same state. If 00d is only on the link, that child reaches
the app another way. Are they held too?

### 2c. A new screen that needs a ruling: the age check

The contract now carries `AgeCheckResponse` with `blocksAccess` and a state of
`matched | mismatch | resolved | awaiting_parent`, and `student-entry` returns
`ageCheckPending` alongside `consentState`.

**This is not 00d.** A disputed date of birth is not a missing consent: the
adults disagree with each other, rather than one of them not yet having
answered. It also blocks access, so the child does meet something.

Does it get 00d's two lines, or a screen of its own — and is the child told
anything about why?

### 2d. Scaffolds, and the rule that transitions are felt rather than seen

The scaffold endpoints return `levelChanged: boolean` and `nextIntensity`
(`full_support | partial_support | hints_only | independent`).

An adaptation transition is felt, not seen — so I am assuming **nothing
announces a change of support level**: no toast, no "we've made this one
easier". Confirming rather than assuming, because the same response also carries
a `studentMessage` string written by the server, and I need to know where that
is allowed to appear and where it is not.

### 2e. Still open from before, unchanged

The teacher's note slot — worth re-raising, because unlike a generated highlight
a teacher deliberately typed those words **to that child**. Frames for
`number_line`, `array`, `place_value` and `counters`, or a ruling that the
pipeline should not emit them. A done state for the daily warm-up. The
nothing-landed result copy, and whether `invalid_session` needs words of its
own. Whether the demo walkthrough should be reachable by typing a URL. QR
scanning. The calculation scaffold for anything beyond two like fractions. A
system voice reading to six-year-olds.

---

## 3 · The teacher-lane session

Three things, none of them mine to fix.

1. **Your item 0b is closed by the same delivery that closed our S-B 6.**
   `GET /api/v1/students/{student_id}/sessions` returns
   `StudentSessionSummaryResponse` carrying `sessionId`, `lessonId`,
   `completionStatus`, `sitting` and `signalCount`; the detail path gives
   `narrative` and `sections`. The client is shared, so it is one wrapper
   serving both lanes.

2. **`npm run architecture` exits 1 on `main`.**
   `teacher/Shell/NotificationsPanel.tsx:81` — *"sufficiency decided here, not
   by the engine: `empty = notes.length === 0`"*. Pre-existing and untouched.

3. **S-A 18 is still open and it is a teacher-lane file.**
   `UploadWizard.tsx:285-290` awaits the parse run and tests
   `run.status === "failed"` and nothing else. **A Zero-Tag rejection does not
   fail the run** — it completes, having fallen back to splitting the source, so
   the teacher reviews split-up source text believing it is generated content.
   `fallbackSegmentCount` is in the same object the wizard already polls, is
   typed at `content.ts:133`, carries a docblock calling it "THE FIELD THAT
   MATTERS", and no screen reads it. When it equals `segmentCount` the lesson is
   entirely fallback. The wizard's existing `fallback` phase is a different
   thing — an unreadable file — so this needs its own state.
