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

### 2d. ~~Scaffolds, and the rule that transitions are felt rather than seen~~

**WITHDRAWN THE SAME DAY — frame 37a already answers it, and against my
assumption.** I had asked whether a change of support level announces itself,
assuming rule 7 meant the indicator stayed invisible. It does not: 37a puts a
permanent four-circle indicator top-right of every lesson player, opposite the
exit. Rule 7 lives in HOW it changes — *"states cross-fade in 400ms; the circles
just update, the label never animates."* **Please ignore this question if it
reached you.**

**One thing DOES still need you, and it is narrower.** The pill is four dots
plus the fixed word "Support"; the state names on the sheet are annotations
rather than copy, so no words about a level reach the child anywhere on the
frame. But `ScaffoldDecisionResponse.studentMessage` is **required on the wire**
— the server writes a sentence to the child about the change — and there is
nowhere on any frame to put it. It is typed and rendered nowhere. Is that the
`highlights` ruling again ("do not build a surface for it"), or does it have a
home we have not drawn?

**And a frame defect worth knowing:** 37a ships with its dot styles as
unsubstituted template variables (`{{ dF }}`, `{{ dO }}`), so the circles have
no fill, size or colour in the file. The intent is unambiguous from the counts —
4/3/2/1 filled — and the built component already matches, so nothing is blocked.

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

---

# The teacher lane's asks, 23 September 2026

Added to this file rather than a second one, because three lanes writing three
documents to the same two people on the same day is how a question gets missed.
Same discipline as above: every claim re-derived against the deployed spec
today (`225 paths, 406 schemas`) or read out of the source, not carried
forward.

Section 3 is answered at the foot.

---

## 1T · Backend (Teslim)

### 1Ta. ~~A stage value for "preparing the adaptations"~~ — **WITHDRAWN, and one contradiction left behind**

**Design struck it the same day, 23 Sep:** *"do not hold it pending an enum.
Adaptation in this product is generated on demand at serve time and discarded,
which means no adaptation work happens at upload at all. There is no signal
behind that stage because there is nothing behind that stage. Four stages is
not a degraded version of five, it is the accurate one."*

So the ask is withdrawn. The processing screen ships at four stages because
four is right, not because the fifth is missing.

**What has not been settled, and it is a question for both of them.** Backend's
own figures for this same route are about **115 seconds of text work plus up to
600 seconds per generated picture, at upload** — which is the measurement the
long-wait copy on that screen was built from on 18 Sep. If pictures are made at
upload then something *is* prepared there, and design asked to be brought back
to in exactly that case: *"if Teslim says otherwise and something genuinely is
prepared at upload, bring it back to me with what that work is and I will
re-rule."*

Both cannot be right:

- If **backend** is right, the fifth stage returns as the longest part of the
  wait, and a teacher currently watches "Finding the sections" through all of
  it.
- If **design** is right, the long-wait copy is describing work that does not
  happen, and the 600-second figure belongs to serve time rather than upload.

Nobody needs to build anything until that is answered. It is recorded in
`ProcessingStages.tsx` so the next reader meets it there too.

### 1Tb. `incidentId` — confirm the shape, because the spec cannot

Every unhandled error carries one now, and #510 reads it so a teacher can quote
it. But `incidentId` appears **nowhere in the OpenAPI document** — re-checked
today across 225 paths and 406 schemas — which is correct, since an unhandled
error is not a documented response, and also means we are reading a field we
cannot type.

We read two positions, top level and nested under `detail` the way FastAPI
nests its error bodies, and refuse anything that is not an identifier: strings
only, trimmed, non-empty, no whitespace, **at most 64 characters**.

**The ask:** if the field sits somewhere else, or ids can exceed 64 characters,
say so and we will widen it. A quiet miss here looks identical to a 500 that
carried no id.

### 1Tc. The staged-upload 500, and why you will not find an incident for it

Everything this console observed, written down at
`CONSOLE_INVENTORY.md` rather than left in a chat log:

| | |
|---|---|
| Request | `POST /api/v1/uploads`, via our proxy at `www.nevolearning.com/api/backend/...` |
| Status | `500`, in roughly 3 seconds |
| Body | **plain text, not JSON** — Starlette's default page |
| File | ~270 KB PDF |
| Scope | a unit or term; on that date the single path still used `/api/content/upload` |
| When | ~18 Sep 2026 |

Three seconds rules out a timeout — that route has a 240s budget on our side —
so it failed on the way in, not while parsing. And the plain-text body means
**no `incidentId` for that occurrence**: the field did not exist yet. Asking us
for one is the wrong shape of answer. The next one will carry it.

### 1Td. LR-06 needs a field that is not `status`

Design's field list came back and all three caveats hold against the spec:

- **`subject`** already exists on `LessonSummaryResponse`, inherited by
  `LessonDetailResponse`. Do not re-add it.
- **Year / class level** is not on a lesson. `yearGroup` appears only on
  `ClassOptionResponse`, `ClassSummaryResponse`, `ClassWrite` and
  `DerivedClass`. A lesson reaches one only through an assignment, and an
  unassigned lesson has none at all.
- **`status`** is `ContentParseStatus` — `pending / processing / completed /
  completed_with_review / failed`. It answers *"did the parse finish"*.

A draft/ready flag answers *"has a teacher decided this is fit to go out"*, and
the two come apart in both directions. Overloading `status` would also collide
with `readyToAssign`, which already means a third thing. Three meanings in one
field, and this screen would be the first to read it wrongly.

**The ask:** a separate field, or confirmation that `readyToAssign` plus a
teacher-set draft flag is the whole of it. No preference on the name — the
point is that we do not infer it. Also raised on SCRUM-153.

### 1Te. The assignment 409 is invisible to the contract

You described `{"code": "lesson_not_approved", ..., "lessons": [{lessonId,
outstandingKeyPointCount, unapprovedSegmentCount}]}` and LR-07 renders it. But
`POST /api/v1/assignments` documents **201, 401 and 422 only** — no 409
anywhere in the document.

Same shape as the consent 403s in §1b above: the enforcement is real and we
believe it works, but a generated client cannot see it and our contract gate
cannot check it. We handle it defensively, which means a change to that body
would fail silently rather than loudly.

### 1Tf. Do the two upload pipelines produce the same lesson?

Open since #480 and the only thing in this list that could already be wrong in
production.

Single-lesson uploads moved from `POST /api/content/upload` to the staged
`POST /api/v1/uploads` with `scope=lesson`, because the staged route is the
only one that carries a structure to review. The block path has relied on it
since 1 Sep and our proxy treats both as generation routes, which is the
evidence there is.

**The ask:** confirm a `scope=lesson` staged upload generates the same variants
and media as the content route did. If it does not, we have quietly thinned
every single-lesson upload since 21 Sep.

---

## 2T · Design (Lydia)

### 2Ta. LU-02 and LU-03 travel together, and one without the other is worse than neither

LU-02 invites a teacher to leave while a lesson processes. LU-03 is the
indicator that gets them back.

The claim underneath is true — the job has its own identity server-side and
survives the tab. What is missing is the return path: **a teacher who leaves
mid-processing has no route back to that screen**, because the lesson does not
exist in the library until confirm.

So #511 states the fact — *"Carry on, we'll tell you when it's ready"* —
without offering a door that leads nowhere.

LU-03 is also not an upload-screen change. It needs the upload's state to
outlive the wizard and be readable from anywhere in the console: a provider at
the shell. **Happy to take it next; it wants sizing rather than bolting on, and
the ticket puts two other items ahead of it.**

### 2Tb. C06b drops the section a key point came from — deliberate?

The collapsed card shows the mark, the point, the chip and the chevron; the
expanded card shows the source, what Nevo read, and the three actions. Neither
names the section it came from, and the build has followed the frame.

`segmentId` and `segmentTitle` are both on the contract and unused. A teacher
checking six points across four sections may want to know which is which — but
that is your call, not ours to reinstate quietly.

### 2Tc. The parse-failure state is still undrawn, and one of its siblings may be the wrong shape entirely

C07f covers an unreadable file and a lost connection. A run that finished
**FAILED** was added on 18 Sep at backend's request and has no frame — it
currently borrows the unreadable layout and prints the server's own reason.

Two corrections to how this was recorded, both made today after re-derivation:

- **`partial` is not a backend gap.** `failedPages` has been on the status
  response since 18 Sep and renders as the faint-pages line and its retry. What
  goes unused is C07f's `partial` *screen* — a frontend decision, not a missing
  field.
- **`noBoundary` may not want a screen at all.** It is derivable from
  `structure.lessons.length === 1`, and C07f's own text calls it *"a normal
  outcome — it degrades to one lesson and flows straight into the section
  parse"*. A failure screen for a normal outcome is worth questioning before it
  is built.

### 2Td. Standing, unchanged

- **The teacher's note.** Still held: the prior question — whether it is for
  the teacher's own use or intended to reach the parent — is unanswered, so
  placement cannot be ruled. Nothing renders it, and that remains correct.
- **Lesson detail across several classes.** Showing all of them needs a layout
  C06b does not draw. The misleading half is fixed: `classCount > 1` says
  progress is shown for one class.
- **Teacher onboarding.** What a newly activated teacher is *asked* — their
  name and subjects already arrive from `users/me` and are editable on the
  profile screen.

---

## 3T · QA

**Your build predates 21 September.** The screenshot for "Assign to a class is
off-centre" shows an Edit button beside it, and Edit was removed in `31dda76`
on 21 Sep. That does not invalidate any of the five reports — each was
re-tested against current `main` before anything was changed — but four of them
sat in code that moved twice that week.

All five are now closed or accounted for:

| # | outcome |
|---|---|
| 3 | **Blocked, not forgotten.** LR-06 waits on §1Td above. |
| 4 | **Fixed.** A settled point folds itself away. C06b draws a checked card collapsed with a tick, not hidden, so it collapses rather than disappears. |
| 5 | **Fixed, and it was never the button's position.** The label wrapped to two lines inside a fixed-height button, so the text sat high in a box that could not grow. Your screenshot is what found it. |
| 6 | **Fixed.** Fixture lessons drew for the whole in-flight window, and a lesson chosen in that window was a fixture id on its way to a real assignment. |
| 7 | **Fixed, and it was ours.** The gate ANDed a client-side count into the server's verdict, and the count included every unapproved segment while only flagged ones are drawn. |

**The most useful thing next time:** the viewport width, and whether you are
signed in. Two of these five took an extra round for want of one of those.

---

## 4T · Other lanes, and one thing everybody should know

**`npm run architecture` now gates.** The three findings `--warn` was waiting on
are closed, the script exits 0 on `main`, and the flag is deleted as
`BUILD_STATUS.md` instructed. If it turns your merge red for something you did
not write, say so rather than restoring the flag — a gate that goes back to
warning is the failure the old comment described.

**Two admin Overview test files fail on a clean `origin/main` tree** —
`OverviewGettingStarted.dom.test.tsx` and `OverviewCards.dom.test.tsx`. Verified
by stashing a feature branch and re-running against main alone. They are
load-sensitive: 17 failures across the two under the full parallel suite, 2 when
run alone, which is why CI stays green and nobody has noticed.

**Counsel, standing:** the class narrative naming an individual learner is at
risk under clause 8.2 and contract-ready is **not** cleared. Session detail is
LIVE *and* going into the counsel addendum as an undisclosed surface — built and
shipped is not the same as disclosed.

---

## Answering section 3

1. **Item 0b** — agreed and already closed our side; session detail shipped
   17 Sep on `GET /students/{id}/sessions`, and `useStudentSessions` is the
   shared wrapper.
2. **`npm run architecture` exiting 1** — closed. It was a **false positive**:
   `empty = notes.length === 0` is absence, which rule 5 requires this console
   to detect and render. Frontend §6 is about whether there is enough evidence
   *about a child*; an empty notification panel is not a judgement about
   anyone. The detector cannot tell those apart — `empty` is in its name set
   precisely because the real defect wore that name — so it is an allowlist
   entry stating why, printed on every run, rather than a loosened rule.
3. **S-A 18** — closed, but **not where the ticket pointed**.
   `UploadWizard.tsx:285-290` no longer exists: the single path stopped polling
   parse runs on 21 Sep and the staged status response carries no fallback count
   at all, so reading `fallbackSegmentCount` there would have fixed nothing for
   the path that needs it. The same fact is on the lesson, per segment —
   `deterministic_parse_used` in `reviewReasons` — which both pipelines produce.
   A lesson whose every section carries it now says so before the review, in its
   own state, because the review means something different when the words are
   the teacher's own.
