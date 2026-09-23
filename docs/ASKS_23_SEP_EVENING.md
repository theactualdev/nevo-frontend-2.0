# The asks, 23 September 2026 — evening

Backend answered the morning's list in full and shipped most of it. This is
what is left, re-derived against the spec after their push rather than carried
forward.

**One ask from this morning is WITHDRAWN because it was wrong.** See §1c.

---

## 1 · Backend (Teslim)

### 1a. `module_boundary_action` — the precise name you asked for

**We were talking past each other, and the fault is mine for listing it beside
four things that sound like thresholds.**

You counted five *break thresholds* (`time_threshold`, `engagement_decline`,
`comprehension_drop`, `repeated_errors`, `replay_accumulation`) and could not
map my five onto them. Mine were not thresholds. **All five were
`SignalEventType` values — inputs we report, not outputs you compute.** Four of
them landed in the 27 → 31 expansion:

| | |
|---|---|
| `break_start` | landed |
| `break_end` | landed |
| `feeling_checkin` | landed |
| `module_boundary_reached` | landed |
| **`module_boundary_action`** | **still absent — this is the whole ask** |

**It is the sibling of `module_boundary_reached`, which you already added.**
`reached` says a child arrived at a module boundary; `action` says what they
then did.

**We already emit it.** `LessonPlayer.tsx:1075`, payload
`{ moduleId, action }`, where `action` is **`"continue"` or `"break"`** — the
two buttons on the boundary screen, "Yes, continue" and "Take a break first".

**And we already throw it away.** `signals.ts` filters every event against a
local copy of your enum before posting, because one unknown type rejects the
whole batch with a 422. So the signal is collected on device and dropped at the
door, every time a child meets a module boundary.

**The ask is one enum value: `module_boundary_action`.** Nothing else changes —
we are already sending the payload shape.

**Why it is worth having:** it is the only place a child is *offered* a break
and answers. You said `midpointReached` feeds break-type selection; this is the
outcome of the offer at that same moment, which is the half that says whether
the offer was right.

### 1b. A teacher's name on `AssignmentResponse`

Design ruled the teacher's note reaches the child, *"attributed to the teacher
by name"*. It shipped today **unattributed**, because nothing on the wire says
who wrote it — no `teacherName`, `assignedBy`, `assignerName` or `setBy` in any
of the 406 schemas.

The two near-misses both name the wrong person:

- `lesson.createdByName` is whoever **authored the lesson**, which is a
  different teacher whenever someone assigns a colleague's lesson.
- `/classes/{id}/teachers` returns a **list**, not an author.

Putting one teacher's name on another teacher's words is worse than naming
nobody, so it currently signs *"Your teacher"*. **One field on
`AssignmentResponse`** — whoever wrote the note — and it becomes what design
asked for.

### 1c. `problemId` — WITHDRAWN, and it was my mistake

This morning I asked for a stable question identifier for
`ScaffoldAttemptRequest.problemId`, saying nothing in a lesson had one.

**It does. `ComprehensionCheckpoint.id` is required on the wire and has been
all along.** Our own `assessmentFor` builds each assessment question from a
checkpoint and then discards its identity — the adapter's own comment says so
out loud — so the field looked absent from inside this client.

That is the "grep for the capability, not the name we proposed" failure written
into our own inventory, and I walked into it the same week I wrote it down.
**Nothing needed from you. The scaffold attempt write is unblocked and ours to
build.**

### 1d. Landed, consumed, and confirmed working

- **PIN, all five carriers at 4–8 digits.** Verified. `STUDENT_PIN_LENGTH` will
  drop to four now that design's ruling is finally implementable.
- **`currentPin`, enforced.** Built and shipped today — frame 27's step 1 has
  somewhere to go after being drawn since the beginning. Thank you for
  flagging that it is enforced; that turned it from a gap into a break we
  caught before it bit.
- **`depthVariants` + `availableDepths`.** Both consumed today. Keying
  `simplified`/`expanded` to the engine's own action names was the right call —
  it made the join a one-liner and the schema description told us exactly what
  to do. **Expand is unblocked as a result**, which design had deferred for
  lack of content.
- **`ProactiveAction` is authoritative**, and knowing `offer_hint` and
  `show_socratic_panel` are declared-but-never-emitted is worth more than the
  enum itself. We had two surfaces built for instructions that cannot arrive.

### 1e. Still open on your own list — recorded, not re-asked

Per-question attempt store, `BaselinePromptResponse` (still `{dimension}`), a
boundary field on `AskResponse`, a plain-language lesson description. You
confirmed each as not built; nothing further needed from us until they are.

---

## 2 · Design

### 2a. Three of the four affective responses cannot fire, and it is not our doing

Backend, today: `ProactiveAction` is authoritative and all five values are
declared, **but only `simplify`, `slower` and `expand` are ever emitted.**
`offer_hint` and `show_socratic_panel` are declared because the shapes exist
and a client renders them — *"nothing produces them yet"*.

So `FrustrationHint` and `ConfusionSupport` are built, wired, correct, and
unreachable. The break is fine — it has its own always-present field and works.

**Nothing to decide here. It is a status correction:** the affective layer is
further from live than either of us thought, and the reason is production
rather than transport or vocabulary.

### 2b. `invalid_session` needs its words

You ruled it gets its own copy — *"nothing landed and a dead link are different
problems with different next actions, and giving them the same copy sends a
child to try something that cannot work."* Agreed, and it is blocked on the
words themselves. Two short lines and it ships.

### 2c. The shared manipulative set

You ruled: emit them, *"drawn once as a shared set rather than per lesson,
because they are representations of a concept rather than decoration for a
question."* `number_line`, `array`, `place_value` and `counters` stay refused
until that set exists — a wrong interaction is a different task, not a lesser
version of the right one. **No decision needed; this is a queue position.**

### 2d. The warm-up card, now that the warm-up is once a day

One warm-up a day shipped today: a second visit opens on the done state and
submits nothing, which stops four visits sending four measurements of the same
dimension.

**The dashboard card still says "Begin warm-up" after today's is done.**
Tapping it lands on the done state, which is honest but not what the card
should say. **Not invented** — it needs a word from you, and it is small.

### 2e. The clause that needs its own conversation

*"We are narrowing to secondary for launch, which takes the youngest band and
everything audio-led with it."*

That arrived as the justification for closing a minor row and it reaches much
further than the row:

- **The baseline is built for four bands** — `p13`, `p46`, `jss`, `ss`. Secondary
  is the last two. Which remain is a question about the baseline, the probe item
  set and SCRUM-176's count.
- **Audio is a modality, not a feature.** `MODALITY.AUDIO` is one of the channels
  the multi-modality system switches between, and §5 requires a minimum of two
  per segment. Removing *audio-led content* is not the same as removing
  *narration*, and which is meant matters.
- **The modality suggestion is already structurally unreachable** because visual
  generation is failing library-wide. If audio goes too, it is worth knowing
  what is left to switch between.

**Nothing has been changed on the strength of it.**

---

## 3 · The teacher / admin lane

### 3a. URGENT — uploads have been failing since 9 September

`POST /api/v1/uploads` and `/uploads/batch` have returned 500 on **every call**
since 9 Sep. Both delegate to a helper needing a session factory that neither
route declared, so every call raised a `TypeError` before any work happened.

**Our recorded 18 Sep observation matches exactly**: 500 in ~3 seconds,
plain-text Starlette body, nothing in the parse logs. It was never the PDF, the
size or the block path — a one-line text file would have done the same.

**Backend's conclusion, and they have asked us to confirm it from logs:** our
own inventory says single-lesson uploads moved onto that route on **21 Sep**, so
**every single-lesson upload since then has failed too.** If you have seen a
success since 21 Sep, say so — they want to know, because it would mean they
have misread their own fix.

Fixed and deploying in `0875317`. They have added tests asserting every route
delegating to that helper declares its required parameters, and confirmed they
fail against the old code.

**Also settled, and it closes an old worry:** once it works, `/uploads`,
`/uploads/text` and `/api/content/upload` are identical — same
`ContentParseRequest`, same `ContentParsingService.parse`, same segments,
variants and media. **Nothing was being thinned by the staged route.** The only
difference is a job row and a structure for review.

### 3b. Two names backend is waiting on from you

- **A fifth `UploadStage` value.** They agree the gap is real — it is
  `lessons → structure → complete` today and media sits invisibly inside it, up
  to 600s. *"Tell me the name you want and it goes in with the next batch."*
- **A teacher-set "ready to go out" flag (LR-06).** They agree `status` answers
  "did the parse finish" and `readyToAssign` answers "is anything outstanding",
  and neither answers "has a teacher decided this is fit to go out". They want
  **the name**, and an answer to **whether a teacher can un-ready a lesson that
  is already assigned.**

### 3c. Shipped for you, unprompted

`POST /api/v1/assignments` now documents its 409: `detail.code` is
`lesson_not_approved` and `detail.message` names each lesson and what is
outstanding. It was being raised and rendered nowhere.

### 3d. Still open and still yours — S-A 18

`UploadWizard.tsx:285-290` tests `run.status === "failed"` and nothing else. A
Zero-Tag rejection does **not** fail the run: it completes having fallen back to
splitting the source, so the teacher reviews split source text believing it is
generated content. `fallbackSegmentCount` is in the object the wizard already
polls, typed at `content.ts:133`, docblocked *"THE FIELD THAT MATTERS"*, and no
screen reads it. When it equals `segmentCount` the lesson is entirely fallback.
