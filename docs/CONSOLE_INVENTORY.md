# Console inventory — what is undone

**Teacher rows re-verified 21 Sep 2026 against `main` @ `4c619be`** - but only the ones
this session's work touched, which is seven of them. Every other teacher row still
carries its 16 Sep reading and should be read as that old. The student half below is
older still.

**All three consoles.** Teacher and parent re-verified 16 Sep 2026 against `main` @
`64a74b0`; the student console surveyed 16 Sep against `main` @ `bd4b89c`. Both against the
deployed spec as it stood that day (v2.0.0, 188 paths, 343 schemas, 205 operations) - it was
192 paths by 17 Sep, so re-check anything load-bearing.

**The student half is at the bottom of this file and carries its own verification caveat.
Read that before quoting a LIVE verdict from it - it was not verified to the same standard
as the teacher rows.**

*A stamp naming a commit is worth more than a date. If `git rev-parse origin/main` no longer
returns the SHA above, some of what follows is older than the code.*

## Why this file exists

The question "is the console complete?" got a different answer every time it was asked,
because there was no maintained list — each answer was re-derived from grep and memory,
scoped to whatever was asked, and drifted. **Read and update this file instead of
re-deriving it.** When a line changes, change it here in the same PR.

Three rules that keep it honest:

- Every verdict carries the `file:line` or spec quote that decided it.
- A component file existing proves nothing. The verdict is about what a **signed-in**
  user sees.
- Every `BACKEND` / `DESIGN` attribution is re-tested against the live spec before it is
  written down. Blockers here have gone stale repeatedly and the comment has outlived the
  blocker every time.

## Verdicts

`LIVE` a signed-in user sees their own data · `PARTIAL` some sections live, some not ·
`FIXTURE-ONLY` renders, but a real user gets sample data or "not available" ·
`NOT BUILT` no component, or the route dead-ends.

## The 44 PARTIAL rows, split by who hits them — 18 Sep

Product could not plan from a flat list of 44, and was right not to try: a missing
export button sat beside a missing step in a lesson. Asked for three buckets — the
child's normal lesson path, the admin or teacher first hour, everything else.

**It needed four.** Eight rows are the CHILD'S first hour — onboarding and the
baseline — and they fit neither "normal lesson" nor "admin or teacher first hour".
Collapsing them into the long tail would have buried the baseline, which the
architecture calls not optional and which every later adaptation is seeded from.
Flagged rather than filed silently.

**Launch set: 35. Long tail: 9.** Each row keeps its verdict and evidence in the
console sections below; this is a view over them, not a second source of truth.

### A · The child's normal lesson path — 20

Sign in, pick a lesson, play it, finish it. Everything here is on the path a child
walks every day.

| row | blocked by | size |
|---|---|---|
| Home — pick back up and today's lessons (the teacher's note is on the wire and discarded — **and must stay that way**, see item 19) | **DESIGN** | S |
| Lessons tab — the grid | FRONTEND | S |
| Lessons tab — empty states (a status chip tells the child their *search* found nothing) | FRONTEND | S |
| Lesson preview sheet | FRONTEND; BACKEND (description) | S |
| Module boundary screen (`modules` erased by our own type) | FRONTEND | S |
| Break offer + break screen (what it observes is discarded) | BACKEND | M |
| Modality suggestion pill (structurally unreachable today) | BACKEND | M |
| "No such lesson" — one branch, already written | FRONTEND | S |
| Check-in — a miss (the authored teaching line is thrown away one step from the screen) | FRONTEND | S |
| Growth result — per concept | FRONTEND | S |
| Growth result — nothing landed | DESIGN | S |
| Summary — live lesson with no recap | FRONTEND | S |
| Review answers — without them (new tab, next day) | BACKEND | M |
| Review session (spaced retrieval) | FRONTEND | M |
| Ask Nevo — a child stuck *inside* a lesson cannot scope an answer to it | FRONTEND | S |
| Notification bell and feed — nothing marks anything read | FRONTEND | S |
| Shell — sidebar, bottom nav, top bar (inert avatar where the frame makes it the profile entry) | FRONTEND | S |
| Daily warm-up card — no done state; a child can re-sit and re-submit | DESIGN | S |
| Daily warm-up run — one fixed stimulus per dimension | BACKEND | M |
| Completion write — `assignmentId` typed and sent by nothing | FRONTEND | S |

**14 of 20 are FRONTEND-only and 13 are S.** This is the cheapest bucket per unit
of child-facing improvement, and the one where "partial" most often means a field
already on the wire and thrown away before it reaches the screen.

### B · The child's first hour — onboarding and baseline — 8

The bucket product did not ask for. Everything a child touches before their first
lesson exists.

| row | blocked by | size |
|---|---|---|
| Teacher Join — QR scan: the **primary** button opens no camera | FRONTEND | M |
| PIN creation — "that didn't save" names the PIN for three failures that have nothing to do with it | FRONTEND | S |
| "You're In" — device cannot remember (built on a premise that has since expired) | FRONTEND | S |
| Shared classroom tablet — second child to sign in displaces the first | FRONTEND; DESIGN | M |
| Module 2B — Arrow Flanker: two trials tagged incongruent with no flankers on screen | FRONTEND | S |
| Module 3 — a **system** `speechSynthesis` voice reads to six-year-olds | DESIGN | S |
| Module 4 — Domain Probe: no item transport exists | BACKEND | M |
| Baseline complete — the honest failure state exists and is unreachable | FRONTEND | S |

**Two are worth reading twice.** The QR scan is the primary button on the welcome
sheet and opens nothing. The shared-tablet row matters more in a Nigerian
classroom than the size suggests — one device, many children, and the second child
displaces the first.

### C · The admin or teacher first hour — 7

Setup, onboarding, uploading, assigning.

| row | blocked by | size |
|---|---|---|
| Teacher onboarding — join-confirm and profile-setup unbuilt; the redirect covers password only | FRONTEND | M |
| Console shell + nav rail — role label is `MOCK_TEACHER.role` unconditionally | FRONTEND; DESIGN | S |
| Home dashboard — the first screen after sign-in | FRONTEND; DESIGN (cutoffs) | M |
| My Classes list — no subjects, headcount or summary line | BACKEND (subjects) | ask |
| Profile & settings — "Change photo" is a `<button>` with no `onClick` | FRONTEND | M |
| Parse fallback — 2 of 4 states live | BACKEND | M |
| Variant review | DESIGN; CONTENT | M |

**The role label is a fixture leak on the first screen a teacher ever sees**, and
belongs with the sweep in section E rather than being costed separately.

### D · Everything else — 9. The long tail a school will not find in term one.

| row | console | blocked by | size |
|---|---|---|---|
| Insights | teacher | BACKEND (nullability); FRONTEND | M |
| Lesson detail | teacher | DESIGN | M |
| Compose message | teacher | FRONTEND | M |
| Recommend a lesson — the "Suggested" badge only | teacher | BACKEND (badge) | S |
| Parent account setup | parent | DESIGN | M |
| Progress tab — `highlights` | student | DESIGN | S |
| Progress tab — "nothing to show yet" | student | FRONTEND | S |
| Connect — unread dot | student | FRONTEND | S |
| Change PIN | student | BACKEND; DESIGN | S |

**Five of the nine are blocked on design rather than engineering**, so the tail is
shorter in build terms than it looks — but it will not shrink by being worked at,
only by being decided on.

### What the split says

- **The launch set is 35 of 44**, so the flat list was not hiding a small core.
- **Bucket A is where the cheap wins are**: 14 frontend-only rows, 13 of them S.
- **Design, not backend, is the binding constraint on the tail** — and on three
  rows in the launch set too.
- **Nothing in bucket B is a demo problem.** It is the hour that seeds every
  adaptation afterwards, and it has the product's only dead primary button in it.

## The headline

**Roughly a third of what this repo files under NEEDS BACKEND is not blocked at all.**
Recommend-a-lesson, specific-students, observation chips, seat context, class headcount
and variant review were six items sitting behind comments that had stopped being true.
Every one is a frontend afternoon. *Stale comments, not missing endpoints, are the
largest category of undone work here.*

**Updated 15 Sep: that is now true of almost everything.** Backend delivered eleven of the
thirteen items in list B in a single afternoon. Of thirteen backend blockers this morning,
**one remains open** (variant approval) and **one was declined** (`category` on
notifications, now a product question rather than a backend one). Ten new items landed in
list A as a result — see *Unblocked 15 Sep*. The teacher console is no longer
meaningfully waiting on backend; it is waiting on us, and in a few places on design.

**Re-verified 16 Sep, and this file was wrong in nine places.** Every open item was read
back against `origin/main` and the deployed spec, and every verdict of "done", "blocked"
or a changed size was then adversarially checked; three of those checks overturned the
first answer. What it found:

- **Four items were already done** — the paused-teacher message (teacher half), Home's
  sample marks, the variant-review entry point, and the expired parent consent token. One
  had been finished for two days. Four afternoons would have gone on rediscovering them.
- **Two real blockers were not written down anywhere.** Session detail is blocked on
  ADDRESSING, not shape (list B, item 0b). Help & support is blocked on CONTENT: two of
  design's three facts — the WhatsApp number and the support response time — exist nowhere
  in the repo, and neither can be borrowed without inventing a commitment.
- **Six sizes were wrong**, in both directions.
- **Two recorded blockers had expired**: the class-code route's DESIGN attribution, and the
  design blocker on the revoked session-end state (the frame was added 10 Sep).

*The lesson generalises: this file drifts the same way the code comments do, and re-reading
it against the repo is itself work that has to be repeated.*

### Re-verified again, later on 16 Sep — five rows wrong, and a pattern underneath them

All 36 teacher rows were read back against `d0ae9fd`, every claim of drift was then given to
a separate reader told to REFUTE it, and **11 of 16 claimed corrections did not survive that
second pass**. Recording that ratio matters more than the corrections: a single read of this
file against the code produces roughly two false corrections for every true one, so
"I checked and the doc is wrong" is not on its own grounds to edit a row.

The five that survived are folded into the rows below. Two moved the wrong way — **Upload
module review from FIXTURE-ONLY to NOT BUILT, and Bulk ingestion from LIVE to PARTIAL** —
which is the first time this file has had to demote a row it had marked done.

**The new finding is a category this file had no column for: unmarked fixture leaks.** Five
surfaces hand a signed-in teacher invented data, and because they are not wrapped in
`SampleRegion` the E2E assertion that exists to catch exactly this cannot see them. They are
listed in section E. A verdict of LIVE in the table means *the live read is wired*; it has
never meant *nothing invented reaches the teacher*, and on four rows those two are different.

**Both halves of this file must be audited, not just the table.** Line 167 said the
assignment note "waits on backend" while lines 98 and 240-248 of the same file said it
shipped. The 16 Sep pass rewrote the table rows and never touched the numbered backlog, so
the contradiction survived a re-verification specifically looking for it.

---

## Teacher console

| Screen | Verdict | What is missing | Blocked by | Size |
|---|---|---|---|---|
| Ask Nevo drawer | LIVE | — (entry prompts are static UI copy) | NONE | — |
| Bulk curriculum ingestion | **PARTIAL** | **Demoted 16 Sep**, and the empty cell was hiding three things. (1) **Fixture leak on the live path**: `BulkIngestion.tsx:329-349` shows "{sorted} of 13 lessons sorted" with a 0%-width bar for the whole of a real batch — `TOTAL` is the hardcoded 13 at :48 and only `runDemo` ever increments `sorted`, while `startParse` never touches it. (2) Two dead controls: "Import from Google Drive" (:308) and "Import from OneDrive" (:317), both `<button>` with no handler. (3) `loadTitles` (:92-107) fires once, immediately after the batch POST resolves, and never retries — `lessonTitle` cannot exist before the parse has read the file, so nearly every row falls back to the filename and the 3 Sep title feature is effectively off | FRONTEND | S |
| Connect threads | LIVE | — | NONE | — |
| Feedback panel | LIVE | — (no test on the write) | NONE | — |
| Upload scope + file | LIVE | — | NONE | — |
| Retry a bad parse | LIVE | Built 17 Sep. "Try that again" on the parse result re-runs the reading over the lesson's own stored text through `POST /api/content/lessons/{id}/regenerate`, in place, so a teacher never ends up with two copies of the same title. Design's ruling: this is the PRIMARY remedy and re-upload is the fallback. **Still open and unowned: there is no delete on any lesson or upload route**, so a duplicate created before today cannot be removed | BACKEND (delete) | — |
| Teacher activation | LIVE | — (copy signed off 14 Sep) | NONE | — |
| Password reset | LIVE | Error states unsigned-off | DESIGN | S |
| Session expired door | LIVE | Only the "expired" variant. **Two corrections, 16 Sep.** The code set is **FIVE**, not four — `invalid_session` is in the deployed spec alongside `session_expired`, `session_revoked`, `session_replaced` and `account_paused`. And "none is consumed anywhere" was **false**: `account_paused` is consumed at all four sign-in doors via `loginFailure.ts:38` (`auth/login/page.tsx:171`, `ReturningSignInScreen.tsx:187`, `TeacherSignIn.tsx:153`, `AdminSignIn.tsx:220`). What is true is that none is consumed on the SESSION path, because `handleAuthFailure` is exempted from `/auth/login`, and `ConsoleSessionExpired` takes only `signInHref`. Carrying a reason means changing `client.ts`, which all three consoles route through. Design HAS drawn revoked (`student/28a Session Ended - Revoked`, 10 Sep) — only `session_replaced` and `account_paused` remain undrawn for the console | FRONTEND | **M** |
| Lesson library | LIVE | **Subject pills live 18 Sep.** The upload asks (from the teacher's own `users/me` subjects, not a list written in the repo), both wrappers send it, the card mapper carries it back, and the row is built from the subjects the shelf actually contains — so it shows Biology and Chemistry for a school that teaches them. Hidden below two subjects, because a filter that cannot filter is worse than none. Both stale comments corrected | — | — |
| Notifications panel | LIVE | — | NONE | — |
| Feedback panel copy | LIVE | — (counter already present at the last 200 chars; design to confirm the threshold) | NONE | — |
| Class code / QR | **LIVE** | — **Standalone route built 16 Sep** at `/teacher/classes/{classId}/code`; "Show full screen" now navigates rather than opening an overlay with no URL. Historical note, kept because it cost time: **"Dialog only" is loose shorthand and would send someone to rebuild a screen that exists**: `ClassQrScreen` — the full-screen projection the standalone route is FOR — is already built and mounted from live class detail (`LiveClassDetail.tsx:358-364`, via the dialog's `onProject` at :355). What is missing is a URL that links and reopens, not the screen. Design ruled 15 Sep to build it (section C) | NONE | — |
| Sign-in | LIVE | — (`classifyLoginFailure` wired 14 Sep: a paused account is told the account is not open, a throttled one to wait. Re-verified 16 Sep.) The admin door was the last one left and is **DONE 16 Sep** — `AdminSignIn.tsx:220` classifies too, with its own paused line because the teacher's names an authority a proprietor does not have. **All four doors now classify**: `auth/login/page.tsx:171`, `ReturningSignInScreen.tsx:187`, `TeacherSignIn.tsx:153`, `AdminSignIn.tsx:220`. ~~Still open — fixture leak #1~~ **CLOSED same day, #408** (`377ca27`): the hardcoded "Corona Secondary School · Lagos" eyebrow is gone and a comment at `TeacherSignIn.tsx:215` records why no school is named pre-auth. Section E's leak #1 is done; the other four stand | NONE | — |
| Console shell + nav rail | LIVE | Both halves closed 17 Sep. The role label reads `roleLabel(identity?.role)` and renders nothing for a role it does not recognise, rather than `MOCK_TEACHER.role` unconditionally; Help & support has a destination at `/teacher/help`, live from the public support-contact endpoint | — | — |
| My Classes list | PARTIAL | Card carries no subjects, headcount or summary line. **Split 16 Sep: these are not one job.** Headcount is ours — `ClassLearningPulseResponse.studentCount` is required on `GET /api/v1/teachers/me/home`, already called. **Subjects has no teacher-readable source**: the only schema carrying `subjects` is `ClassSummaryResponse`, and both operations returning it are tagged "school administration"; it is not even in that schema's `required` list. The subjects leg is a backend/scope ask, not an afternoon. **Headcount built 16 Sep** from the home read's `studentCount`, and the fixture leak is marked (section E). Only subjects remains, and it is not ours | **BACKEND (subjects)** | ask |
| Class detail + roster | **LIVE** | — **Lessons tab built 16 Sep**; Activity is RULED OUT, not missing. Design: a per-class activity feed "is a surveillance surface by default and we have nothing that needs it." The Lessons tab shipped because design made it conditional on whether the library can be filtered by class, and it cannot: `GET /api/content/lessons` takes `limit` and `scope` only, `LessonScope` is `mine or school`, `LessonSummaryResponse` carries no class. `GET /api/v1/assignments?classId=` answers it instead. Read-only by ruling | NONE | — |
| Compose message | LIVE | **Deep link built 18 Sep, and the diagnosis in this row was half wrong.** The resolver was not the whole problem: all three LIVE callers - the flag card, the student profile and the session panel - linked to a bare `/teacher/connect`, and `LiveFlagCard.test.tsx` asserted that as correct. Connect derives whether to open compose from the `student` query, so the action opened the thread list and stopped. The callers now name the child by id, and the modal resolves it against the roster it already reads - matched on `studentId`, never on a name, because a school with two Amaras would otherwise address the message to whichever one the directory listed first | — | — |
| Home dashboard | PARTIAL | **Activity counts done 17 Sep** — `completedCount`/`totalCount` were on the wire and absent from `ActivityRow`, so the live list was strictly poorer than the sample beside it; they render as a separate element that disappears when absent. What remains: the class trio's subject line, which has no teacher-readable source (see My Classes), and **"Good to know", which is inside a `SampleRegion` with no live field behind it at all** | BACKEND (subjects); DESIGN + BACKEND (good to know) | M |
| Insights | PARTIAL | **HALF-UNBLOCKED 20 Sep — re-check before planning.** The ruling had two halves. (1) *The engine owns the threshold* — **DELIVERED**: `ClassInsightsNarrativeResponse.state` is a new `ClassInsightState` enum, `summary \| settled \| gathering`, and backend's own description names the defect it fixes: *"The console was deciding this itself from the length of three arrays, which put a threshold in the client."* Two caveats: it is **optional with `default: "summary"`, not required**, so an older build can omit it and the client must treat absence as unknown rather than as "summary"; and it is what the `useClassInsights.ts:151` gate finding is about, so wiring it should close that too. (2) *`weeklySummary`/`lookingAhead` nullable, absence meaning render-the-empty-state* — **NOT delivered**: both are still required non-nullable `string`, unchanged since 17 Sep. **See the clause 8.2 caveat in the BUILD_STATUS handoff before building this.** Per-student recommendations still fan out | **BACKEND (nullability)**; FRONTEND | M |
| Student profile | LIVE | **All 4 drawn actions live 17 Sep** (message, recommend, share, open a session). The session row became startable when backend shipped `students/{id}/sessions` — list B item 0b is closed. **The noticing banner is live 17 Sep** from `flags?studentId=` (`useStudentFlags`); the row that said it wanted an endpoint was wrong, the route has taken `studentId` all along. It renders Nevo's own sentences, one per open flag, each dated — no "This week", which the contract cannot support. The `openFlagCount` callout survives as the fallback for a failed flags read. C08's evidence list stays out under the 30 Aug aggregate-only ruling, with `helpSeeking` shipping in its place | — | — |
| Lesson detail | PARTIAL | **Reclassified 17 Sep: DESIGN-blocked, not a small.** The misleading half is already fixed — `classCount > 1` renders "progress shown for one class", so the screen no longer passes one class off as the whole picture. Showing ALL classes needs a layout the frame does not draw, and it sits beside C06b's unsettled mastery display. (The variant-review entry point shipped 14 Sep — re-verified 16 Sep, it renders once per section) | **DESIGN** | M |
| Lesson assignment wizard | LIVE | — ("Specific students" built 15 Sep on `useStudentDirectory`, keyed by `studentId`) | NONE | — |
| Variant review | PARTIAL | **Audio player built 17 Sep** — it recovers a dead signed URL once through `contentApi.mediaUrl` on the element's own `onError`. Approval also landed 17 Sep, per segment, with assignment gated behind it. What is left is the 5th tab (SCRUM-136, list item 12), and the two records disagree: the item says design ruled it on 14 Sep, the component says C16d draws no tab and it was raised with design. **The invention is smaller than the component thought** — "Worked steps" is already the teacher-facing name for a calculation variant in this file's own review-reason copy, so what is missing is placement, not vocabulary | DESIGN (placement); FRONTEND | M |
| Parse fallback | PARTIAL | **3 of 5 states reachable, up from 2 of 4.** A fifth was added 18 Sep at backend's request: a run that finished FAILED is its own state, saying so and printing the server's `failureReason`, where it used to be converted into a synthetic 500 and reported as a lost connection. `partial`/`noBoundary` remain unreachable signed in. **Design has not drawn the new state** — C07f covers an unreadable file and a lost connection, and nothing for work that started and could not finish | BACKEND (`partial`/`noBoundary`); DESIGN (the new state) | M |
| Teacher onboarding | PARTIAL | **Sharpened 21 Sep.** Activation itself is LIVE: `/auth/teacher/activate` reads the invite token and sets a password, and `/teacher/onboarding` is a redirect onto it so links already in inboxes still land. What is unbuilt is C01's own beats — the join-confirm and the profile-setup step. Worth settling before building: a teacher's name and subjects already arrive from `users/me` and are editable on the profile screen, so the question for design is what a newly activated teacher is ASKED rather than shown | FRONTEND; DESIGN (what it asks) | M |
| Profile & settings | LIVE | Built 18 Sep. `POST /api/v1/users/me/profile-photo` was deployed all along; the reason nothing could be built on it is that `profileImageUrl` was missing from the `CurrentUser` client type, so the field arrived on every identity read and was dropped. One `AvatarDisc` now serves the rail, the profile header and the dialog, and it falls back to initials when a stored URL dies | — | — |
| Parse progress ladder | LIVE | — (three rungs keyed to `UploadStage`, driven by the live stage; design ruling 14 Sep) | NONE | — |
| Upload module / section review | **NOT BUILT** | **Demoted 16 Sep.** A signed-in teacher never sees the Photosynthesis six: `SectionReview` is dead code, reachable only through `runMockBeats`, gated on `!getToken()`. The live path always sets `parsed` and renders the read-only `UploadResult` instead (`UploadWizard.tsx:394-409`, :282-294). So on live there is **no module review at all** — no split, no merge, no rename, no re-order, no "keep it as one flow". The task is to build it, not to wire a fixture up | FRONTEND | **L** |
| Structure preview (standalone) | ~~FIXTURE-ONLY~~ **DELETED 17 Sep** | The route served a hardcoded P5 Science fixture to signed-in teachers and discarded the in-flight poll on the way in. "Open and steer" is a callback now, and a caller that passes none renders no control | — | — |
| Student observations (C16b) | LIVE | — (built 15 Sep: chips, seat, and the two markers) | NONE | — |
| Recommend a lesson | PARTIAL | Built and live 15 Sep, note box included. The "Suggested" badge stays blocked — `Recommendation` is prose with no lesson id. The note is sent and stored and **nothing renders it, which is now the correct state**: design has not ruled who the note is for (see item 19), so the confirmation says the note went with the lesson rather than promising the child will read it. **Fixture leak fixed 16 Sep**: the sheet offered eight invented lessons on a failed read, and its honest-empty copy was unreachable | BACKEND (badge); **DESIGN (the note's audience)** | S |
| Share with Learning Support | LIVE | — (built 15 Sep on `POST /api/v1/escalations`: `LiveShareSheet`, confirmed per C14 B5. The SENCo cannot yet SEE what arrives — see below) | NONE | — |
| Session detail | LIVE | Built 17 Sep. Backend shipped `GET /api/v1/students/{id}/sessions`, which carries the id the panel needed; `useStudentSessions` reads the list, `LiveSessionPanel` opens one. The list also distinguishes a second visit from a first, which `progress.lessons` never could | — | — |
| SSO callback | NOT BUILT | Component complete and live-wired; `slug` landed on `SchoolCodeResponse` 15 Sep, so the signed-out door can now reach it | FRONTEND | M |
| Notifications page | NOT BUILT | Deliberate redirect — C13 is a popover | NONE | — |
| Students index | NOT BUILT | Deliberate redirect to Classes | NONE | — |


**Variant review, two divergences found 14 Sep.** C07b draws it as ONE screen with segment
*pills* and a "← My Lessons" back link; what is built takes `?section=N`. More
substantially, C07b's stated purpose is that "the teacher reviews each segment's variants
and **approves** them for the class. Approval is manual and deliberate." **There is no
approval transport** — `approve` appears in none of the 188 paths (re-checked 15 Sep) and nowhere in the
document; the only sign-off field is `VisualVariant.reviewedBy`, which is a read. So what
is built is review *without* approval, and the approval half is a backend ask nobody had
made. Added to list B.

## Design rulings, 16 Sep — and one that cannot be built yet

**1. Class insights narrative. THE RULING IS RIGHT AND THE CONTRACT WILL NOT CARRY IT.**
Design ruled the same design as the observation count: the engine owns the threshold,
`weeklySummary` and `lookingAhead` are nullable, and **absence is the instruction** — if the
engine cannot support a summary it sends nothing and we render the empty state. Nothing
derived from row counts on our side.

The deployed `ClassInsightsNarrativeResponse` declares both as `{"type": "string"}` and lists
both in `required`. **Non-nullable and mandatory**, so the engine has no way to send nothing
and the empty state is unreachable — the same shape of bug as the recommend sheet's
unreachable copy, one layer down. Building to the ruling today would mean the frontend
inventing a threshold, which is the exact thing the ruling forbids.

**The ask is one line: make `weeklySummary` and `lookingAhead` nullable.** Until then this
row is backend-blocked, not frontend work.

The empty copy, for when it lands: *"No summary this week. Nevo writes one when there is
enough in a week to say something useful."* Note it is about the WEEK, never the class —
design was explicit that "this class has been quiet" is a finding we have no grounds for. One
empty state covers a quiet week and a new class both; design does not want them
distinguished, so no signal is needed for it.

**2. Session-end states: FOUR screens, not five.**
- `session_expired` and `invalid_session` share the ordinary end-of-session screen. Invalid
  means a malformed or unknown token, which is either our bug or tampering, and neither is
  something to put in front of a teacher.
- `session_revoked` as drawn.
- `session_replaced` gets its own screen and says plainly that they signed in on another
  device — the one state where the honest wording matters, because if it was not them they
  need to know.
- `account_paused` is **not a session state and must not look like one**. Same frame as the
  paused learner, one level up: it points at the school administrator, and carries **no retry
  button**, because retrying does nothing.

**3. Class-wide messaging: OUT for v1, confirmed.** Compose is scored complete against the
frame; the transport capability (`messages.ts:14` types the union, `deliver` already takes
`"class"`) is a **deliberate deferral**, recorded in section D. Design's reasoning is worth
keeping: a one-to-one message exists because something triggered it and is attached to that.
A broadcast has no trigger, duplicates channels the school already runs, and sends messages
to families the school never approved. That is a school's decision, not a feature we ship
because the transport allows it.

**4. Lessons tab: IN for v1, and built 16 Sep.** Design made it conditional on one fact —
whether the library can be filtered by class. It cannot, so a teacher had no way to answer
"what has this class been given", which they ask every week. Read-only, with status; no
authoring, because the Library stays the only place a lesson is created. **Activity is out
either way.**

Design also asked that the signed-out sample class screen stop drawing three tabs the
product does not have: "a sample screen is a promise, so either it matches what we ship or
it changes." Changed 16 Sep — `ClassDetail.tsx` now draws Roster and Lessons.

---

## Parent console

| Screen | Verdict | What is missing | Blocked by | Size |
|---|---|---|---|---|
| Parent consent (D01b) | LIVE | — | NONE | — |
| Parent data management (D01c) | LIVE | Does not name the recipient address the frame names | FRONTEND; CONTENT | S |
| Parent growth view (D15d) | LIVE | No school attribution. Backend reported 15 Sep that the statements are already gender-neutral and a regression test holds it — the one delivery of the eleven that cannot be checked against the spec, so it wants a spot-check on real prose before the row is closed | FRONTEND; VERIFY | S |
| Parent account setup (D02) | PARTIAL | No route of its own; contact read-only where the frame draws it editable; SMS copy invented | DESIGN | M |
| Parent sign-in (D03) | LIVE | — (built 14 Sep at `/parent-sign-in`; takes email **or** phone, see the note) | NONE | — |

**The parent lane no longer hangs on one token** (14 Sep). `/parent-sign-in` is built, and
`/parent-portal` offers it instead of telling a parent to go and find a link that may
already have expired.

**Two things about it design should see.** D03 says "Email only, no password" and labels
the field "Email address"; the 14 Sep ruling on the sister screen says "SMS is the path to
get right, not the fallback", and `request-code` takes `contact` rather than `email`. Built
to the newer ruling, so the field accepts either — email-only would lock out every parent
whose school holds a number. And the resend reads "Send it again" per that ruling, not
D03's "Resend code", because two parent auth screens with two wordings for one action is
the worse outcome. Both are a label and a validator to reverse.

**Still open:** the invitation's `expiresAt` is typed and never read, and
`GET /api/v1/consents/parent/{token}` documents **only 200 and 422 — no 404**, which the
UI assumes. That is backend item 11 and matters less now that a dead token is no longer
the end of the road.

---

## A. Buildable today — priority order

**Read section E first.** The five fixture leaks found on 16 Sep are all S, all buildable
today, and one of them — the sign-in door naming Corona Secondary School to every teacher in
the country — is the single most embarrassing thing in this console and a smaller fix than
anything numbered below. They are listed there rather than here because they share one cause
and are best done as a sweep.

1. ~~**Paused teacher told their password is wrong.**~~ **BOTH HALVES DONE.** Teacher
   14 Sep, admin 16 Sep; all four doors now classify. The admin half was taken here
   rather than left flagged, because it locks a proprietor out of their own school with
   the correct password and there is nobody above them to ask. **Its paused line is not
   the teacher's** — "your school admin can tell you more" is a circle when the person
   reading it IS the school admin, so the admin line offers a colleague holding `team`
   and then `support@nevolearning.com`. The refusal cannot tell a SENCo from a sole
   proprietor, so it serves both. Nine tests in `AdminSignIn.dom.test.tsx`.
2. ~~**Parent sign-in (D03).**~~ **DONE 14 Sep.** Built at `/parent-sign-in`; the portal's
   signed-out screen offers it rather than pointing at a link that may have expired.
3. ~~**Student observations (C16b).**~~ **DONE 15 Sep.** Chips imported from
   `lib/constants/observations.ts` rather than restated; seat context shown; the two
   markers labelled rather than coloured.
4. ~~**Home sample marks.**~~ **DONE 15 Sep**, re-verified 16 Sep. The four regions
   (`teacher:home-pulse`, `-flags`, `-activity`, `-good-to-know`) are on main, so the E2E
   assertion cited as proof that no teacher sees invented data is no longer vacuous on the
   dashboard. It would now fail if Home stopped marking.
5. ~~**Variant review entry point.**~~ **DONE 14 Sep**, re-verified 16 Sep. The screen is
   reachable from lesson detail, once per section. This line stayed open for two days after
   the work landed, which is the same failure this file exists to stop.
6. ~~**"Specific students" in the assign wizard.**~~ **DONE 15 Sep.** The guard refused
   on a premise that had stopped being true; `useStudentDirectory` already had the ids.
7. ~~**Recommend a lesson.**~~ **DONE 15 Sep.** Reused `assignmentsApi.create` rather
   than wrapping a second path. **Corrected 16 Sep:** the note field does NOT wait on
   backend — it shipped the same day (see the table row and item 19), and this clause
   contradicted two other places in this file for a day. Only the "Suggested" badge waits.
8. **Class headcount** — a join on `classId` against data rendered two sections up. **S**
9. **Revoked session-end variant.** **M** — re-sized 14 Sep, re-verified 16 Sep. The
   four codes are consumed nowhere, `ConsoleSessionExpired` has no reason prop, and the
   plumbing runs through `client.ts`, which student and admin share.
   **Not design-blocked.** `student/28a Session Ended - Revoked` was added 10 Sep and its
   headline is verbatim what `ConsoleSessionExpired` already renders, so the revoked state
   composes by DELETING the inactivity sentence. `session_replaced` and `account_paused`
   console copy are genuinely undrawn; revoked is not, and can ship first.
   **Do `client.ts` first, not last.** The student "expired" door is already live and
   routed, so a student-only change delivers nothing visible — the code at `client.ts:244`
   is the only place any of the four reasons exists, and everything else waits on it.
10. **Connect deep link.** **M, not S** — re-sized 14 Sep. The preset is fixture-bound in
    three places across two components, and the profile link sends no query at all, so
    this is a preset-resolution change rather than a one-line href.
11. **Delete or re-point `/teacher/lessons/upload/structure`.** **S** — confirmed 16 Sep
    after a re-size to M was itself refuted. C07e draws "Open and steer" as a *button with an
    onClick*, not a link: the standalone URL was this repo's invention, so the honest
    re-point is a prop on `ParseProgress` flipping to the `LiveStructureTree` the wizard
    already renders one branch away. No new route, no resumable hook, no shared seam.
12. **Calculation variant tab (SCRUM-136).** Ruled 14 Sep. The fifth form a student can
    receive, which a teacher currently cannot preview at all. **M**
13. **D02 SMS and email copy**, to design's exact strings, plus "Send it again". **S**
14. ~~**Teacher-side active/inactive indicator.**~~ **DONE 16 Sep.** The roster marks
    "Invited" and "Deactivated" and says nothing on an active row. Outlined and muted, not
    coloured: admin draws this pill violet, and violet on this row already means "has a
    learning profile" - a third meaning on one colour is how a teacher acts on the wrong
    one. Words, like the C16b markers beside it. `accountStatus` narrows the wire value and
    resolves anything unrecognised to `invited`, never `deactivated`, because telling a
    teacher a real child is switched off on a value we did not recognise is the failure
    that matters. Copy lives in `lib/constants/accountStatus.ts` with a test that fails on
    consent vocabulary, on giving a reason, and on any instruction the teacher cannot act
    on (`deactivate` and `restore` are both tagged "school administration").
    The old **M** sizing was right, and the notes below are why.
    **No backend work at all.** `ClassStudentResponse.status` is a REQUIRED property of
    `GET /api/v1/classes/{class_id}/students`, typed `UserStatus` = `active | invited |
    deactivated`. It is already fetched, already typed, and thrown away at render:
    `student.status` appears nowhere in `LiveClassDetail.tsx`, while `profileStatus`,
    `seatContext`, `observations` and `flags` are all read. The comment at
    `classes.ts:80-82` is false on both halves. Today two rows look identical whether or
    not the child can actually use Nevo.
15. **Help & support screen** — email, WhatsApp, response time. **S to build, but
    CONTENT-BLOCKED.** Re-verified 16 Sep: the support email exists
    (`support@nevolearning.com`, hardcoded in five places). The WhatsApp number does NOT —
    every `+234` string in the repo is school or parent fixture data, and there is no
    `wa.me` link anywhere. Nor does a support response time: the two response-time strings
    that exist are a landing-page sales promise and an NDPA 48-hour data-objection SLA, and
    borrowing either would invent a commitment Nevo has not made. **Someone has to supply
    the number and the turnaround.** Until then the nav item closes the menu and does
    nothing, which is the one route out of the console when something goes wrong.
16. **Standalone class-code route**, and the assign-wizard class selector. **M**
17. **Parent polish** — name the recipient in D01c, school attribution on D15d, link
    `/parent-portal` from somewhere. **M, not S** — re-sized 16 Sep. Three independent legs
    across two lanes, and one of them (D01c's recipient) needs a content answer first: the
    frame names an email address, but the payload field is `parentContact`, which may hold
    a phone number. Naming an address for an SMS-only parent is not a frontend decision.

### Unblocked 15 Sep — these were list B this morning

~~Sizes are first-pass, read off the shape of the endpoint rather than a written plan.~~
**Re-verified 16 Sep against the code, so the sizes below are now measured rather than
guessed** — and three of the ten moved: two were re-sized S to M, one (27) was already
done, and one (26) turned out to be blocked on addressing rather than buildable. Of the
eleven deliveries, **two of the eleven need no frontend work**: gender-neutral growth
statements, and the expired consent token, which was already handled.

18. **Teacher→SENCo escalation.** `POST /api/v1/escalations`. The most-asked-for missing
    action on the teacher console, and the one with a child's welfare behind it.
    ~~**M**~~ **DONE 15 Sep.** `LiveShareSheet` posts the escalation; C14 B5's dismiss,
    toast and quiet note all wait on a stored one. `attentionFlagId` is deliberately not
    sent — flags carry ids and this console already reads them, but C.8b never asks the
    teacher which flag they mean, and guessing would tell the SENCo the wrong thing.
    **The receiving half is not built** — see item 0 in list B.
19. ~~**Assignment note.**~~ **DONE 15 Sep, teacher half.** C08c's "Add a note for Amara
    (optional)" box is in the recommend sheet and what it holds is sent. An untouched or
    whitespace-only box sends no `note` key at all, so a child never gets an empty message
    from her teacher. `note: string | null` was also missing from the client's `Assignment`
    type, which would have dropped it before any screen could read it.
    **THE CHILD CANNOT SEE IT, AND THAT IS NOT THE DEFECT** — corrected 21 Sep, and
    this entry had it wrong in a way that would have caused the harm. It was recorded
    as a student-console task: the note rides `students/me/dashboard`, nothing renders
    it, so somebody should render it. Two places in `assignments.ts` said the same
    thing more strongly, calling the note "a message to the CHILD" — an inference
    drawn from the transport, never a ruling.
    **Design has not ruled who it is for.** The prior question is whether a note is for
    the teacher's own use or is intended to reach the PARENT, and placement cannot be
    ruled until that is answered. So nothing renders it on any surface, the
    confirmation keeps saying the note went with the lesson rather than promising the
    child will read it, and the test that guards that wording stays.
    A note written as a private reminder, or for a parent, shown to the child it is
    about is not a layout mistake. It is the wrong audience reading a teacher's words
    about them, and the student console would have been within its rights to build it
    off what this file and that comment said.
20. **Class Insights narrative.** `weeklySummary` and `lookingAhead` at
    `GET /api/v1/classes/{class_id}/insights`. **M** — re-verified 16 Sep. The endpoint is
    live and unwrapped; there is no backend blocker. The real obstacle is a SHAPE MISMATCH
    between what the frame draws and what the endpoint returns, plus no signal for when the
    narrative should be shown at all. That is a **design ruling**, not a backend ask. The
    screen is not wholly fixture-backed either — three sections already render real data.
21. **Per-row completion on recent activity.** `completedCount` / `totalCount`, both
    nullable — so the row must still render when they are absent. **S**, confirmed 16 Sep:
    clean, no blocker, and the field has to go onto `ActivityRow` in `teacherHome.ts` or a
    missing client type will silently drop it, exactly as `note` was dropped on
    `Assignment`. Today Home's LIVE activity list is strictly poorer than the sample one
    the same screen shows when the read fails.
22. ~~**`failedPages`.**~~ **DONE 18 Sep.** The whole seam: the field is on the client
    type, the poll carries it, the staged review says which pages came through faint and
    what that means for the unit below, and the control sends exactly those page numbers
    to `retry-pages`. The retry puts the upload back into parsing and the screen follows
    it rather than sitting on a structure the server is replacing.
    **Two corrections found in the doing.** The client's `retryPages` response type was
    wrong in three ways — it named a `lessonId` the response does not carry, typed
    `pagesRetried` as a count when it is the list of page numbers, and omitted `status`
    and `stage`, which are the whole reason a caller has to resume polling. Nothing
    caught it because nothing called it. **And design has not drawn this state**: C07f
    covers a parse that failed outright, not one that came back with holes, so what
    ships is the honest minimum — what is missing, and the one action that fixes it.
23. ~~**`subject` on upload.**~~ **DONE 18 Sep.** The whole seam: asked at upload, sent on
    both multipart bodies, carried back through `toCard`, and filtered on. Both stale
    comments are corrected in place rather than deleted, because the reasoning they
    recorded was sound and the premise was what went stale.
    **The taxonomy question is raised, not answered.** C07 draws a select of Mathematics,
    English, Basic Science and Social Studies - a four-value list that is already wrong
    for this repo's own fixtures, where a class is Biology, Chemistry and Physics. The
    options come from `users/me.subjects` instead, so a teacher with none recorded is not
    asked, and a teacher uploading outside their own subjects cannot label it. Where the
    vocabulary should come from is design's call, and `GET /api/v1/lessons` takes no
    subject parameter either, so the filtering is over the page in hand.
24. **Profile photo.** Read `profileImageUrl`, then `POST /api/v1/users/me/profile-photo`
    (multipart, key `file`). **M**, confirmed 16 Sep, no blocker. "Change photo" is the only
    dead control in the profile menu — a `<button>` with no `onClick`.
25. **Teacher-initiated SSO.** `slug` on `SchoolCodeResponse`. **M**, confirmed 16 Sep,
    with two caveats that are real but not fatal: the teacher door has **no school-code step
    at all** today, and `AuthMethod` is `email_password | pin | sso` — so the response says
    a school uses SSO but not WHICH provider, and the client has to branch on that. Today an
    SSO-school teacher is simply told school sign-in is not set up.
26. **Per-student session detail.** ~~**M/L**~~ **BLOCKED — moved to list B, item 0b.**
    Re-verified 16 Sep and this is the one item on this list that cannot start. The response
    SHAPE landed; the ADDRESSING did not. `GET /students/{student_id}/sessions/{session_id}`
    wants a session uuid, and **nothing a teacher can read returns one**: the recent-sessions
    row type has no session id, `ClassStudentResponse.latestSessionAt` is a timestamp, and
    the activity-feed id is an untyped string with no stated relation to a session. The
    panel itself is frame-complete and mounted only for signed-out visitors, so once the id
    exists this is **M**, mostly wiring.
27. ~~**Expired parent consent token.**~~ **ALREADY DONE** — re-verified 16 Sep. Whoever
    built the parent portal handled the 404 before backend documented it, and the deployed
    spec has since caught up. Nothing to build; a parent already gets the terminal screen.

## B. Blocked on backend — the exact ask

**Eleven of the thirteen were delivered on 15 Sep.** Each line below was re-checked
against the deployed spec that day — this records what the spec shows, not what the mail
said. All eleven are now frontend work and appear in list A.

| Was blocked | Now on the wire |
|---|---|
| 1. Teacher→SENCo transport | `POST /api/v1/escalations` takes `{studentId, note, attentionFlagId?}`; `GET` returns the SENCo view. The recent picture is derived server-side. |
| 2. Per-student session read | `GET /api/v1/students/{student_id}/sessions/{session_id}` → `{sessionId, lessonId, lessonTitle, occurredAt, sittings, narrative, sections}`. The per-section prose we asked for. |
| 3. A note on an assignment | `note` on **both** `AssignmentCreate` and `LessonAssignmentRequest`; `AssignmentResponse` returns it. |
| 4. Profile photo | `profileImageUrl` on `CurrentUserResponse` and `ProfilePatch`; upload at `POST /api/v1/users/me/profile-photo`. |
| 5. Teacher-initiated SSO | `slug` on `SchoolCodeResponse`, alongside `schoolId`, `schoolName`, `authMethod`, `classes`. |
| 6. `failedPages` | `failedPages` on `UploadStatusResponse`. Populated when page-level parsing falls back. |
| 7. Class narrative | `GET /api/v1/classes/{class_id}/insights` → `weeklySummary`, `lookingAhead`. |
| 8. Per-row completion | `completedCount`, `totalCount` on `TeacherRecentActivityResponse`, both nullable. |
| 9. `subject` on upload | `subject` in the multipart body of `POST /api/content/upload`, carried into the lesson. |
| 11. Expired consent token | 404 for unknown, revoked **and** expired, documented in OpenAPI. D03's terminal screen can rely on it. |
| 12. Gendered growth statements | Backend reports the prose is already gender-neutral and a regression test holds it there. **Not spec-verifiable — taken on their word, unlike every other row here.** |

Note the path parameters above: they are `{student_id}` and `{class_id}`, still
snake_case, while every property those endpoints return is now camelCase. That is the
wire, not a typo.

**Three remain** (0b closed 17 Sep) — two from 15 Sep and one created by shipping the
teacher half of escalations. The fourth was found on 16 Sep by re-verifying a delivery that
was recorded as complete, and backend closed it the next day.

0b. ~~**Nothing hands a teacher a session id.**~~ **CLOSED 17 Sep** — backend shipped the
    `GET /api/v1/students/{student_id}/sessions` list named as the ask below, and the
    teacher half is built on it (`useStudentSessions`, `LiveSessionPanel`). The record of
    the blocker is kept because the way it was missed is the lesson: a delivery was ticked
    off on its response shape alone, and nothing checked that a caller could address it.
    Found 16 Sep. The per-student session read
    was delivered on 15 Sep and ticked off, but only its RESPONSE shape was checked. The
    ADDRESSING is missing: `GET /api/v1/students/{student_id}/sessions/{session_id}` takes
    a `session_id` of `format: uuid`, and every schema in the deployed spec was enumerated
    for a session-id property — the only carriers are student-client writes, the caller's
    own auth session, and `StudentSessionDetailResponse` itself, which you cannot read
    without already holding the id. The list the panel would open from has no session id;
    `ClassStudentResponse.latestSessionAt` is a timestamp; the activity-feed id is a bare
    string with no stated relation to a session and no uuid format, so it is not a safe
    substitute; and `lessonId` is a separate entity on the same response. **The ask is one
    line: a session id on each recent-session row, or a
    `GET /api/v1/students/{student_id}/sessions` list.** Everything else for C08d is
    frontend work, and the panel is already frame-complete.

0. **Nothing acknowledges an escalation.** `EscalationResponse.acknowledged` is a boolean
   on the read, but no endpoint sets it — `POST /api/intelligence/flags/{flag_id}/acknowledge`
   covers Nevo's own flags, not teacher escalations. A SENCo can therefore read a concern
   and has no way to mark it handled, and the teacher is never told it was seen. Ask for
   an acknowledge write, or a ruling that the field is informational.

10. **`category` on `NotificationResponse` — declined.** Backend confirmed on 15 Sep this
    will not be implemented. Re-checked the same day: `NotificationResponse` is
    `{notificationId, recipientId, recipientRole, type, title, description, read,
    createdAt, navigatesTo, archived, archivedAt}` — no category field. Whatever this was
    for must be built on `type` or dropped. **This is now a design/product question, not a
    backend one.**
13. **Variant approval — unanswered.** Backend's reply did not mention it. Re-checked
    15 Sep: no path matches `approve` or `variant`, and no non-GET operation mentions
    either. C07b still says "the teacher reviews each segment's variants and approves them
    for the class", and `VisualVariant.reviewedBy` exists to be written by something.
    Either a write, or a ruling that review is read-only and C07b's copy is stale.

## C. Blocked on design

**All ten were ruled on 14 Sep.** What remains from those rulings is BUILD work, not
waiting, so it has moved to list A. Kept here as the record of what was decided:

1. ~~Fifth variant tab~~ → **build it**, labelled "Calculation", same shape as the others,
   worked steps in sequence and the completion statement beneath. **SCRUM-136.**
2. ~~Pulse band cutoffs~~ → hardcoded is fine for launch since the labels derive from the
   cutoffs. Design is asking backend to serve the threshold so it does not live in the
   console permanently.
3. ~~Help & support~~ → **one screen, not a knowledge base**: support email, WhatsApp
   number, response time.
4. ~~Consent on the teacher roster~~ → **no consent column, ever**. The ruling rested
   on the Deactivated pill already telling a teacher why a child cannot get in, and that
   pill was on the ADMIN roster, not the teacher one. **That dependency is now met**
   (16 Sep): the roster marks "Invited" and "Deactivated", no consent, no reason, just
   whether the child is active - which is the ruling's own wording, and the whole of the
   design brief, because no teacher-facing frame draws this state at all.
5. ~~`UploadStage` → rung mapping~~ → **done 14 Sep**, three rungs, labels below.
6. ~~D02 editable contact~~ → **drop the edit.** Read-only stays; the binding is the
   security property, and a parent who has not proven who they are should not choose
   where the code goes. A different address is a change the school makes on the record.
7. ~~SMS copy for D02~~ → **write both paths properly**, SMS is the path to get right and
   not the fallback. Email: "Check your email. If that address has an account, we've sent
   a code." SMS: "Check your phone. If that number has an account, we've sent a code."
   Resend reads "Send it again" in both.
8. ~~Error states~~ → **ship what we have**; copy revised 14 Sep, see the house rule below.
9. ~~Class selector~~ → **build it.** Defaults to the class navigated from, alphabetical
   first if arrived at directly.
10. ~~Class-code screen~~ → **standalone route.** Teachers project it, read it aloud and
    return to it; a route links and reopens cleanly.

### House rule, applied 14 Sep

**No dashes in Nevo copy, anywhere.** Full stops or commas. 23 instances across the
teacher and parent consoles were corrected. **60 remain in the student and admin
consoles**, which other sessions own.
6. **D02's editable contact field** — the frame draws it editable; the backend binds the
   code to the school's contact, so editable would let a link-holder redirect it.
7. **SMS copy for D02** — the frame is email-only; Nigeria is SMS-first.
8. Error states for activation, Ask Nevo history and feedback — written in-house.

## D. Not a gap — do not re-open

- `/teacher/notifications`, `/teacher/students`, `/teacher/onboarding` all redirect
  **deliberately**; the last replaced a simulation that showed 89 invented students to
  anonymous visitors and wrote a token-less `nevo.role=teacher` cookie.
- C01 Step 1 "verify email" — the invite link *is* the verification.
- No class-wide broadcast in compose — **ruled out for v1, re-confirmed by design 16 Sep**, and the transport capability is a deliberate deferral rather than an oversight. Reasoning in the rulings section above. The earlier tension in this file is resolved: Compose is scored COMPLETE against the frame, and its sizing excludes class addressing. Previous note, kept for the record: **Note the tension,
  flagged 16 Sep:** the Compose row scores "cannot address a class" as an open gap feeding
  its M sizing, while this line rules it out. The code sides with this line
  (`ConnectView.tsx:217-219` hardcodes `recipientType: "student"`) but the transport is
  already there — `messages.ts:14` types the union and `ConnectView.tsx:166-170` `deliver`
  already takes `"class"`. This wants a ruling, not a size. Until it gets one, the Compose
  row's M should be read as excluding it.
- Flag sparkline and second action — deferred to v1.5 by design.
- Engine params never rendered — Zero-Tag ruling.
- `DELETE /ask-nevo/threads/{id}` and `DELETE /assignments/{id}` unwrapped on reasoning.
- Email read-only in the profile modal — "Managed by your school".
- Ask Nevo history has no fixture fallback — a fabricated conversation is words put in
  the teacher's mouth, and no sample mark makes that acceptable.
- `not_enough_yet` on the growth view is a correct state, not missing data.
- A parent who withdrew is never re-asked.
- **No notification filter.** C13 draws none — it is "a calm reverse-chronological
  popover", unread carrying a soft tint and nothing else. An earlier version of this file
  listed a missing `category` field as a backend ask; there is no control for it to feed,
  and `NotificationType` already carries nine values if one is ever drawn.

---

## E. Unmarked fixture leaks — found 16 Sep

**A LIVE verdict in the table means the live read is wired. It has never meant that nothing
invented reaches the teacher, and on these rows those are different facts.** Every one of
these renders fixture data to a signed-in teacher WITHOUT a `SampleRegion` wrapper, so
`e2e/teacher-signed-in.spec.ts` — the one test whose entire purpose is "a signed-in teacher
is never shown invented data" — cannot see them. Its assertion is vacuous on each.

Ordered by what a teacher would actually believe.

1. ~~**The sign-in door names one school to every teacher in the country.**~~ **DONE — #408
   (`377ca27`), the same day it was found.** `TeacherSignIn.tsx` hardcoded the eyebrow
   "Corona Secondary School · Lagos" above "Welcome back", and `TeacherSsoCallback.tsx:8,133`
   rendered "Signing you in through {TEACHER_INVITE.school}" from
   `lib/mocks/teacherOnboarding.ts:18-24`. Both are gone; a comment at `TeacherSignIn.tsx:215`
   records why no school is named before auth. **Four leaks remain, 2–5 below.**
2. **The recommend sheet offers eight invented lessons as the teacher's own library.**
   `useLessonLibrary` returns `FIXTURE_CARDS` whenever the read is in flight OR has failed
   (`useLessonLibrary.ts:201-203`); `LiveRecommendSheet.tsx:61` destructures only
   `{ cards, live }` and never surfaces `sample`, and its honest-empty branch
   (`cards.length === 0`) is unreachable while eight fixtures exist. The Library screen marks
   the identical fallback; the sheet does not. Pressing Recommend posts a slug where the spec
   wants a uuid, so it 422s and nothing is falsely confirmed — but the teacher chose from
   sample data believing it was theirs. The sheet's test mocks the hook wholesale, so this
   path is untested. **S.**
3. **My Classes renders three invented classes with headcounts.** `ClassesList.tsx:117,163`
   renders `TEACHER_CLASSES` — "JSS 2A, 28 students, 2 worth a glance, 1 flagged" — on a
   failed read, and imports `SampleRegion` nowhere, while every other teacher fallback is
   marked (Home ×4, `ClassRoute:57`, `InsightsView:166`, `LessonRoute:110`, `StudentRoute:102`).
   There IS a visible italic banner saying these are samples, so this is a test-coverage hole
   rather than a silent lie. **S.**
4. **Bulk ingestion's frozen progress bar.** See the table row. **S.**
5. **The assign wizard can POST a fixture class id.** `AssignWizard.tsx:171` destructures
   `{options, sample}` and never reads `loading`, so during the in-flight window a teacher
   sees invented classes with no notice, and the confirm guard at :261 tests `sample`
   (failure only), not `loading`. A class picked in that window is a fixture id sent to
   `/api/v1/assignments`. Step 1 has the same flash but IS caught at confirm by the `!live`
   guard at :267 — so the fix is known and already applied one screen away. **S.**

**The shared cause is that `sample` and `loading` are different states and only `sample` is
ever checked.** A fallback that renders during load is invisible to a guard that only tests
for failure. Worth one sweep rather than five fixes.

## F. Things a next reader would waste a day on — found 16 Sep

- **`ClassQrScreen` already exists.** See the Class code row.
- **Three comments still say the insights endpoint does not exist** — `useClassInsights.ts:16`,
  `LiveClassInsights.tsx:13-16`, `teacherInsights.ts:14-22` ("NO SUCH ENDPOINT WAS EVER
  ADDED, and none is needed"). All three are false against the deployed spec. Anyone starting
  that task from the code concludes it is blocked.
- ~~**The variant audio player's blocker has expired.**~~ **BUILT 17 Sep** —
  `AudioVariantPlayer.tsx` mounts in `LiveVariantReview` and recovers an expired signed URL
  once via `contentApi.mediaUrl`. The stale deferral comment is gone with it. It was
  unwritten frontend work, never a dependency, and it sat behind a comment for three days.
- **`VariantReviewRoute.tsx:27-33`** still says "Nothing consumes `variantsApi` yet, which is
  why this still renders" and carries a `TODO(fe)` to build what is built 40 lines below. The
  named export does not exist at all.
- **`EditProfileModal.tsx:89`** still says `TODO(api): photo upload - the frame draws the
  affordance only`, while this file records the endpoint as landed 15 Sep.
- ~~**`uploadsApi.retryPages` is dead API surface**~~ **Closed 18 Sep** with item 22: it has
  a caller, and `failedPages` is on the client type. The pattern it belonged to now has a
  fourth instance and a guard: `profileImageUrl` was dropped the same way (closed 18 Sep,
  with a mapping test), after `note` on `Assignment` and `completedCount` on `ActivityRow`.
- **A dead session-ended route.** `src/app/auth/session-ended/page.tsx:8-10` mounts the
  student screen with a hardcoded `variant="concurrent"`. Nothing navigates to it. The one
  screen already shaped like a `session_replaced` answer is unreachable while `client.ts`
  sends every 401 to the generic expired door.

## G. Corrections to section B, found 16 Sep

- **The 401 code set is FIVE, not four.** The spec's 401 description adds `invalid_session`
  ("a token that was never valid") alongside the four this file lists. A reason-carrying door
  has one more branch than list A item 9 budgets for.
- **"None of the four codes is consumed anywhere" is literally false.** `account_paused` IS
  consumed, at the login doors (`loginFailure.ts:38`, `TeacherSignIn.tsx:155`) — which this
  file's own Sign-in row records. The accurate statement is that none is consumed on the
  SESSION path, because `handleAuthFailure` is exempted from `/auth/login` (`client.ts:128`).
- **`NotificationCategory` IS deployed — just not where item 10 looks.** The spec defines a
  7-value enum and uses it at `NotificationPreferenceResponse.category`, and both
  `GET` and `PUT /api/v1/notification-preferences` are already consumed
  (`settings.ts:83`, `:96`). So **a teacher can already mute a category while no notification
  can say which category it is in.** Item 10 and section D both frame this as purely a
  filter-control question and neither mentions that the enum shipped on the preferences side.
  That inconsistency is on the wire today.
- ~~**Item 0b understates itself: there is no client wrapper either.**~~ Closed 17 Sep with
  0b itself: `studentsApi.session` and `studentsApi.sessions` both exist and are consumed.
- **A genuinely open blocker, written down nowhere: nothing in the spec ENROLS a school in
  SSO.** Every sso path presupposes an existing connection. So even once the teacher door
  reads `slug`, `start` fails for any school that has never connected. (The slug half is
  already dead — `HandoverStep.tsx:70` calls `ssoStart(school.slug, ...)` today.)

---

## The cross-cutting caveat

**No write path in either console is exercised end to end by any test.** The signed-in
E2E suite has never run once — `gh api repos/:owner/:repo/actions/secrets` returns
`{"total_count":0}`, so `test.skip(!EMAIL || !PASSWORD)` fires every run. The four gates
that do run (types, lint, unit, contract) are real. The gate everyone cites as proof that
no real teacher sees invented data is not running — and on Home it would pass even if it
were, because Home emits no sample marks to count.

**Re-checked 16 Sep, and it is weaker than "the secrets are empty".** Repo secrets, BOTH
deployment environments (Preview and Production), and Actions variables are all empty; org
secrets 422 because the repo is not org-owned. There is no path by which those credentials
get populated. **And filling them would not be enough**: `e2e/teacher-signed-in.spec.ts`
contains only READ assertions, so "no write path is tested end to end" would survive.
Separately, section E now records five screens the sample-mark assertion cannot see even
when it runs, so the claim it licenses — "no signed-in teacher sees invented data" — is
narrower than it sounds on four rows besides Home.

**One inert defect worth knowing, because it is the shape the gates cannot catch.**
`LiveRecommendSheet.test.tsx:54` mocks `create` as `{ created: 1 }`; the client types the
response as `{ assignmentIds, createdCount }` and `AssignWizard.test.tsx:72` mocks it
correctly. Two tests, one API, one of the shapes fictional. It is inert only because the
sheet awaits `create` without reading the result, and `tsc` cannot see it because `vi.fn()`
is untyped. The day that sheet reads the count, the test keeps passing and the screen
renders `undefined`.

## The wire changed shape, 15 Sep

Alongside the eleven, backend renamed **every schema property** from `snake_case` to
`camelCase`. Main went red at 13:09 and stayed red for three merges. The client was
brought into line in one pass; what matters for anyone reading this file later is that
the rename was **surgical, not blanket**:

- **Schema properties (404)** — now camelCase.
- **Enum values (126)** — *unchanged*. `sudden_change`, `head_teacher`,
  `multiple_choice`, `completed_with_review`, `learning_data` are all still snake_case.
  A find-and-replace across the repo breaks every one of them, silently, because they are
  string values and no type checks them.
- **Path parameters (20 of 24)** — *unchanged*. `GET /api/v1/classes/{class_id}/insights`
  returns `classId`.
- **Query parameters** — camelCase, *except* `concept_id` and `window_days`, which were
  missed. The same endpoint therefore takes one convention and returns the other.

The last two points are open questions with backend, not settled design. The contract gate
caught all of this within minutes of the first merge, which is the argument for it.

---

# Student console

**Surveyed 16 Sep 2026** against `main` @ `bd4b89c`, the same deployed spec (v2.0.0, 188
paths, 343 schemas), and the four backend deliveries of 16 Sep. 198 reachable states were
enumerated and consolidated into the table below.

**Read this caveat first.** The teacher and parent halves of this file were adversarially
verified row by row. The student half was not, evenly. The verification pass was cut off
partway, so **onboarding and home/progress were fully re-checked, sign-in partly, and the
player, the lesson ending, profiling, Connect/profile/shell and the data layer carry
single-pass verdicts.** Every claim deciding a BACKEND or DESIGN attribution in those
areas was then re-checked by hand against the deployed spec, and that much is verified —
but an unqualified LIVE in the player or profiling sections is one agent's reading. Treat
it as "probably" and re-check before building on it.

## The headline

**The student console is not complete, and the gap is no longer where this repo has been
recording it.** Three things are true as of 16 Sep and none of them is a screen:

1. **A child can get in, learn, and finish.** The entrance, the player and — since
   15 Sep — the ending all work on real content. None of that was true a week ago.
2. **Delivery D removed the excuse.** The library holds three parsed lessons across three
   subjects and three year groups, each with a recap, four assessment questions and
   `comprehensionCheckpoints` on the wire. Every surface recorded as "waiting for content"
   is now waiting for us.
3. **The largest single gap is one unwritten adapter.** `calculationVariant` has **no
   mapper anywhere in the repo**. `LessonPlayer.tsx:91` and `:1238` both require
   `segment.calculationVariant && segment.calculation`, and nothing ever sets
   `calculation` from the wire — so the co-construction solver, the most distinctive
   screen in the product, cannot render for any real lesson. The JSS3 Maths lesson's two
   calculation segments draw as plain text today.

**The recurring shape is unchanged, and it is the thing to grep your own lane for: a field
the backend writes that nothing reads.** This survey found eleven — `modules`, `note`,
`highlights`, `assignmentId`, `conceptId`, `explanation`, `subject`, `estimatedMinutes`,
`blocked`, `session` on the join accept, and the five 401 codes. They are not cosmetic.
The teacher's note never reaches the child it was written for; `modules` being absent from
the client's `LessonDetailResponse` makes every lesson open fetch the same data twice; and
`conceptId` being dropped one step from the screen is the whole reason per-concept results
were filed as a backend blocker they never were.

## Student console

| Screen | Verdict | What is missing | Blocked by | Size |
|---|---|---|---|---|
| Welcome + teacher-invite sheet | LIVE | — | NONE | — |
| Name & age (Step 1) | LIVE | — | NONE | — |
| School code (Step 2) | LIVE | — (free-length and bounded from the contract; refused and "we couldn't check" get different sentences) | NONE | — |
| Class confirmation — verified school | LIVE | — (searchable list, single-class auto-skip and the empty-roster route are all live) | NONE | — |
| Class confirmation — no verified school | FIXTURE-ONLY | `/student/onboarding/class` is open to anyone (`proxy.ts:104`), so a bookmark or a typed URL shows a real child **fourteen invented class names** (`ClassConfirmationStep.tsx:37-52`). Tapping one writes `classId: undefined` and 422s three screens later. A test currently pins the fixture behaviour, so this is a ruling to make, not a bug to quietly fix | DESIGN | S |
| Teacher Join — class code | LIVE | — | NONE | — |
| Teacher Join — QR scan | PARTIAL | The **primary** button on the welcome sheet opens no camera: `TeacherJoin.tsx:112-167` is four CSS bracket spans over a dark box, and a repo-wide grep for `getUserMedia`, `BarcodeDetector`, `<video>` and `jsQR` finds nothing but comments. The teacher's QR does encode a full URL, so the device's own camera app works — nobody has ruled whether that is the accepted path | DESIGN | M |
| Transition + PIN creation | LIVE | — (the shared-tablet PIN bug is fixed: onboarding intent decides, not whether a token happens to be present) | NONE | — |
| PIN creation — "that didn't save" | PARTIAL | The message names the PIN for three failures that have nothing to do with it: a dead invite token, a 422 from `connectClassCode` on an empty draft, and a missing `onboardingToken`. A child retypes a correct PIN forever | FRONTEND | S |
| "You're In" — device remembered | LIVE | — | NONE | — |
| "You're In" — device cannot remember | PARTIAL | Built on a premise that has expired: `GET /api/v1/users/me` returns `school.code`, so once Delivery A's session is stored the school code is fetchable and this branch is unnecessary | FRONTEND | S |
| **First lesson — invite-link child** | **NOT BUILT** | **Delivery A shipped `session` on `JoinAcceptedResponse` today and this repo does not declare it.** `invites.ts:160` types neither `session` nor `consentStatus`, and `ObservedInteractionSequence.tsx:117` stores nothing — so an invite-link child still ends onboarding with no token. Declare both, then `setSession` exactly as `completeAccount` does at `auth.ts:142-149`. The teacher console calls the same endpoint and is unaffected | FRONTEND | S |
| Dead or expired join link | NOT BUILT | `WelcomeScreen`'s `linkError` prop has **no caller** — `page.tsx:22` passes `joinToken` alone. A child who opens a dead link directly walks four screens of onboarding and learns at PIN creation that their PIN "didn't save" | FRONTEND | S |
| Signed-in child re-enters onboarding | NOT BUILT | No bounce. `/student/onboarding` sits in `PRE_AUTH_STUDENT_ROUTES` (`proxy.ts:69`) and returns before the `isStudent` check ever runs; the two bounces that exist (`proxy.ts:126-131`) cover `/auth/login` and `/auth/sign-in` only. **This is the route one child's baseline reached another child's account through** — `pendingBaseline.ts:16-21` names it. Bounce the ROOT only; the step routes are what create the session | FRONTEND | S |
| SSO transition + PIN variants | NOT BUILT | `method` does not survive a reload, so an SSO child who refreshes is dropped into the manual PIN flow with an empty draft, which 422s | FRONTEND | M |
| PIN unlock — all five states | LIVE | — (lock screen, wrong PIN, throttled, our fault, and the device-remembers-nobody case) | NONE | — |
| Account on pause, at sign-in | LIVE | — | NONE | — |
| Forgot PIN | LIVE | — (the frame is informational by design; `auth/pin/reset` is deliberately uncalled) | NONE | — |
| Returning sign-in, new device | LIVE | — (built 14 Sep; the username-as-display-name leak fixed 15 Sep) | NONE | — |
| Session expired door | LIVE | — | NONE | — |
| **Signed in elsewhere / revoked / paused mid-session** | **NOT BUILT** | **Delivery C landed five codes on 176 operations and not one is read.** A child whose account is PAUSED mid-lesson, who is signed out by a teacher, or who signs in on another tablet is told their session "ran out". `AccountOnPauseScreen` already exists and takes no props; frame `28a Session Ended - Revoked` has existed since 10 Sep. The change is to pass the parsed `detail` from `client.ts:244` into `handleAuthFailure` and branch on it. **`client.ts` is shared by all three consoles, so this is the one place it can be done once** | FRONTEND | M |
| `invalid_session` | NOT BUILT | The one of the five where leaving the child on the expired door is defensible. No frame draws it | DESIGN | S |
| Shared classroom tablet | PARTIAL | `nevo.auth.profile` is a single slot, so the second child to sign in displaces the first. Design's answer is frame 28c — up to six children, first name and avatar only, ageing out at thirty days — and **that frame does not exist in the design repo**; only `28` and `28a` are there | DESIGN | M |
| SSO sign-in (start + callback) | NOT BUILT | `SsoStartRequest` requires `provider: microsoft \| google`, and nothing a signed-out child can call names a school's vendor — `SchoolCodeResponse.authMethod` is only `email_password \| pin \| sso`. Children at an SSO school cannot sign in at all | BACKEND | M |
| Player shell, resume, text segment | LIVE | — (resume waits on both reads, so it no longer races the position write that used to destroy it) | NONE | — |
| Audio segment | LIVE | — (real playback; the clip-won't-load state is honest) | NONE | — |
| Inline quick check | LIVE | — (`comprehensionCheckpoints` carried at `fromContent.ts:198`; the miss path teaches rather than just marking) | NONE | — |
| Scaffold indicator | LIVE | — (per-segment `scaffolding` from the live adapt call) | NONE | — |
| Visual segment | FIXTURE-ONLY | Neither our schema nor our code: `VisualVariant` is complete and correct, but **image generation returns 400 on every lesson today**, so `visualVariant` is null library-wide and the JSS2 lesson's `visual_diagram` segment renders as text. Backend has a diagnostic fix deployed; one re-run will name the cause | BACKEND (content) | — |
| **Calculation solver** | **FIXTURE-ONLY** | **No mapper exists.** Nothing anywhere reads `LessonSegmentResponse.calculationVariant` into a `CalculationSegment`; `LessonPlayer.tsx:91,1238` require both and only the mock ever sets `calculation`. The client type is also behind the wire — `variants.ts:89-96` declares six fields where the deployed `CalculationStep` adds **`answer`, `options`, `unit`, `visualUpdate`, `equationState`, `narrationAudio`**. Per-step `answer` must drive each step: mapping the variant-level answer across all three steps of `5x - 4 = 2x + 11` renders "5" for every one, and only the last is right | FRONTEND | **L** |
| Calculation — the visual scaffold | FIXTURE-ONLY | Nobody has decided what the scaffold is for a calculation that is not two like fractions. The deployed `CalculationVariant` has no `{kind, parts, rows}` — it carries `scaffoldImage` (a generated picture) and a per-step `visualUpdate` string | DESIGN | M |
| Interactive segment | FIXTURE-ONLY | Two different objects sharing a name. The wire is a QUESTION — `InteractiveVariant` is `{type, prompt, expectedInteraction, options, answerKey, instructions}` — and the player draws tickable STEPS with an outcome. `expectedInteraction` defaults to `teacher_review`, which hints the payload may not be student-facing at all. No student code reads `interactiveVariant`; only the teacher's variant review does | DESIGN | M |
| Reading-density toggle | FIXTURE-ONLY | No reshape exists on the wire: `TextVariant` carries `body` and `keyPoints` and nothing else, and the engine's `DensityLevel` is a different axis that `adaptation.ts:93-98` deliberately refuses to translate. The bar is absent entirely on live content | BACKEND | M |
| Module boundary screen | PARTIAL | **`modules` is a REQUIRED property of `LessonDetailResponse` and the client interface omits it** (`lessons.ts:114-135`), so it is erased by the type and `useStudentLesson.ts:197-201` fetches it again — every lesson open costs two requests for data the first one already returned. The same failure that dropped `note` from `Assignment` | FRONTEND | S |
| Break offer + break screen | PARTIAL | The screen is live and engine-driven; what it observes is discarded. `break_start`, `break_end` and `feeling_checkin` are **not in the deployed `SignalEventType`** (27 values, checked in full), so `signals.ts:53-96` partitions them out. The consolidation break asks a child how they are feeling and sends nothing | BACKEND | S |
| Affective layer — boredom, confusion, frustration, anxiety | FIXTURE-ONLY | There is no affective transport at all: `affect`, `emotion`, `frustration`, `boredom`, `anxiety`, `confusion` and `socratic` return **zero matches across all 188 paths and 343 schemas**. Nothing to map and no endpoint that would carry one | BACKEND | L |
| Modality suggestion pill | PARTIAL | Structurally unreachable today — the pill needs a segment with two renderable channels, and with `visualVariant` null library-wide that reduces to text and audio only | BACKEND (content) | S |
| Lesson error, empty, cancelled, not-yet-open | LIVE | — (cancelled and not-yet-open shipped today, #402) | NONE | — |
| "No such lesson" (deleted or wrong id) | PARTIAL | The hook already computes `missing`; `LessonRoute` destructures `failed`, `empty` and `unavailable` and not it. One branch, and `LessonMessage` is already the component | FRONTEND | S |
| Lesson complete | LIVE | — (including the "we couldn't save that" state) | NONE | — |
| After-lesson check-in | LIVE | — (intro and question; `assessmentFor` refuses anything it cannot honestly mark) | NONE | — |
| Check-in — a miss | PARTIAL | The authored teaching line is on the wire and thrown away one step from the screen. `ComprehensionCheckpoint.explanation` exists, `toQuickCheck` reads it into `correctNote` (`checkpoints.ts:152-154`), and `assessmentFor` maps only `{prompt, options, correctId}` (`fromContent.ts:310-317`) | FRONTEND | S |
| Growth result — per concept | PARTIAL | The same discard, at higher cost: `ComprehensionCheckpoint.conceptId` and `.conceptName` ride every question and are already typed (`checkpoints.ts:35-36`), and `assessmentFor` drops them — so the result can only tell *all* from *none*. This was filed as a BACKEND blocker ("questions carry no concept id"); **that is false against the deployed spec** | FRONTEND | M |
| Growth result — nothing landed | PARTIAL | Heading and body are ours, flagged unsigned-off in the file itself | DESIGN | S |
| Lesson summary — recap and "what you covered" | LIVE | — (`covered` derived from `conceptName` across the assessment and the segments' own checkpoints) | NONE | — |
| Summary — "From the check-in" list | FIXTURE-ONLY | Needs no endpoint: `conceptName` rides every checkpoint, and the child's own picks are already on the device in `reviewStore.ts:16-27` | FRONTEND | S |
| Summary — live lesson with no recap | PARTIAL | The route does not apply the gate the player already applies (`LessonPlayer.tsx:826-830`), so a lesson with no summary opens a near-empty screen | FRONTEND | S |
| Review answers — with the child's picks | LIVE | — | NONE | — |
| Review answers — without them (new tab, next day) | PARTIAL | **No assessment-attempt endpoint exists in the 188 paths.** Attempts live in `sessionStorage`; the only per-answer write is `POST /api/mastery/update`, which is a mastery update rather than an attempt store, and is itself uncalled | BACKEND | M |
| Review session (spaced retrieval) | PARTIAL | `POST /api/scheduler/record-review` is deployed, needs only `{studentId, conceptId, recallSuccessful}`, and has **no typed client method at all**. The `conceptId` is in hand at the entrance and discarded — `SubjectDetail.tsx:372-378` builds the href from `review.playable` and keeps only the lesson id. The "there is no question to ask" reasoning expired with Delivery D: every lesson now carries four | FRONTEND | M |
| Home — pick back up and today's lessons | PARTIAL | **The teacher's note is on the wire and thrown away.** `AssignmentResponse.note` is typed at `assignments.ts:44` and rides the dashboard read in; every `note` in `HomeDashboard.tsx` is the local progress bucket ("Nearly there"), and the Today mapping drops `a.note` entirely. The teacher's confirmation promises "She'll see your note when she opens it" and a test guards that wording | FRONTEND | S |
| Home — empty and failed states | LIVE | — | NONE | — |
| Lessons tab — the grid | PARTIAL | `subject` and `estimatedMinutes` are on `LessonSummaryResponse`, already typed (`lessons.ts:50,58`), and shown nowhere. With three subjects in the library this is now visible to a child | FRONTEND | S |
| Lessons tab — empty states | PARTIAL | A status chip alone empties the grid and the child is told their **search** found nothing, under a "Clear search" button that resets only the query and leaves the chip active. The screen cannot be recovered without knowing to tap the chip again | FRONTEND | S |
| Lesson preview sheet | PARTIAL | Two of the frame's three facts are on the wire and unused; only the plain-language description has no field anywhere in the spec | FRONTEND; BACKEND (description) | S |
| Progress tab | PARTIAL | `highlights` is a **REQUIRED** `string[]` on `StudentProgressResponse`, is carried to the screen (`useStudentProgress.ts:130`) and is rendered nowhere in the student console. It is a student-level list and the only nearby slot is a per-subject card, so mapping it by index would be fabrication — it needs a designed slot | DESIGN | S |
| Progress tab — "nothing to show yet" | PARTIAL | `ConceptProgressResponse.subject` is nullable and `lessons` is a separate required array, so a child who has finished lessons but whose concept rows carry no subject is told there is nothing to show — and their history becomes unreachable | FRONTEND | S |
| **Subject detail** | **PARTIAL** | **"Lessons you've done" is the whole-student history under one subject's heading.** `SubjectDetail.tsx:105` passes `lessons={live.lessons}`, which `useStudentProgress.ts:116-124` takes unfiltered from the student-wide progress read. With one lesson in the library nobody could see this; with three subjects they will | FRONTEND | S |
| Subject detail — "Ready for another look" chips | LIVE | — (the review-session entrance, wired 15 Sep) | NONE | — |
| Session detail sheet | FIXTURE-ONLY | Addressing, not shape — and **the same blocker as teacher item 0b**: `GET /students/{student_id}/sessions/{session_id}` wants a uuid and nothing a child can read returns one | BACKEND | M |
| Connect — threads, conversation, reply, send states | LIVE | — | NONE | — |
| Connect — unread dot | PARTIAL | `POST /api/messages/threads/{id}/read` is deployed, typed, and called by the teacher console. `useStudentThreads` exposes no equivalent, so the dot never clears | FRONTEND | S |
| Connect — start a new conversation | NOT BUILT | `MessageRecipientType` is `{student, class}` with no `teacher` value, so the only thread-creating call cannot address one. **Deliberate**: access IS the thread, so a child may write where they can already read and cannot start a conversation | BACKEND (by design) | — |
| Ask Nevo — drawer, answer, voice input | PARTIAL | `lessonId` is structurally always null, so a child stuck inside a lesson cannot have an answer scoped to it; `currentPage` is the only context sent | FRONTEND | S |
| Ask Nevo — conversation history | NOT BUILT | Nothing is missing from backend: all three thread endpoints are deployed and consumed elsewhere, and `ThreadSummary` / `ThreadTranscript` are already typed with the windowing the frame describes | FRONTEND | M |
| Ask Nevo — "can't help, ask your teacher" | FIXTURE-ONLY | `AskNevoAnswer` carries no boundary or handoff field, so nothing on the wire can say "hand this to a teacher" | BACKEND | S |
| Downloads tab | NOT BUILT | Both endpoints are deployed and unused; the missing half is the device — a Service Worker and a Cache API store. Hidden from signed-in children, honestly | FRONTEND | L |
| Profile and settings, sign-out, feedback | LIVE | — | NONE | — |
| Profile — avatar selector | NOT BUILT | Nothing to ask for: frame 27 draws eight swatches of the child's own initials, a local look rather than a photo upload, and `/api/settings/me` already carries `displayName` | FRONTEND | S |
| Change PIN | PARTIAL | Frame 27 draws three steps beginning "Enter your current PIN". `PinUpdateRequest` is `{pin, onboardingToken, firstName, lastName, age}` and **no `currentPin`, `oldPin` or `verifyPin` exists anywhere in the spec**. Either an ask, or a ruling that a signed-in child re-entering their PIN is not required | BACKEND; DESIGN | S |
| Notification bell and feed | PARTIAL | Nothing marks anything read: there is no student caller for `markRead`, the row click just closes the panel, and the context exposes no method | FRONTEND | S |
| Shell — sidebar, bottom nav, top bar | PARTIAL | The mobile top-bar avatar is an inert `<span>` where the frames make it the profile entry; the bottom nav renders six items where the frame draws five | FRONTEND | S |
| Rotate prompt | LIVE | Working as ruled ("portrait only, v1") and **there is no escape** — no dismiss, no override, no stored preference. A tablet mounted on a wheelchair tray, or one with rotation locked, has no route into Nevo at all. SEND-relevant rather than hypothetical | DESIGN | S |
| Offline takeover, error boundary, session door | LIVE | — | NONE | — |
| Baseline intro and Modules 1–3 | LIVE | — (scoring fixed 11 Sep; the submit is parked until the session provably belongs to the child who sat it) | NONE | — |
| Module 2B — Arrow Flanker, P1-3 | PARTIAL | Two trials are tagged `congruency: "incongruent"` with no flankers on screen to be incongruent with. Either draw them for P1-3 or record `congruency: "none"` | FRONTEND | S |
| Module 3 — P1-3 audio activity | PARTIAL | A **system** `speechSynthesis` voice reads to six-year-olds in a calibration activity. A large improvement on silence, and not what anyone designed; raised 11 Sep and still unanswered | DESIGN | S |
| Module 4 — Domain Probe | PARTIAL | No item transport exists: the only baseline content operation is `GET /api/baseline/recalibrate-prompt/{student_id}`, returning `{dimension}` and nothing else. Items are authored mocks | BACKEND | M |
| Baseline complete | PARTIAL | The honest failure state exists and is unreachable — `ProfilingIntro.tsx:147-149` renders it on `saved === false` and nothing ever passes false. The daily warm-up does this correctly, so the pattern is already in the repo | FRONTEND | S |
| Daily warm-up card | PARTIAL | There is no done state anywhere: the card is byte-identical before and after, and a child can re-sit and re-submit the warm-up any number of times a day | DESIGN | S |
| Daily warm-up run | PARTIAL | One fixed stimulus with a fixed answer per dimension ("Different", "True", "Right", "Two-thirds"); the only per-day variation the wire offers is *which* dimension | BACKEND | M |
| **Warm-up — a refused write** | **PARTIAL** | **A parked vector is never sent.** A refused write calls `holdBaseline`, and `flushPendingBaseline` has exactly two call sites in the repo, both inside onboarding — which a returning child never runs again. The measurement is held on the device forever | FRONTEND | S |
| Scaffolding that responds to the child | NOT BUILT | A whole deployed subsystem with no client module: `POST /api/intelligence/scaffolds/attempt`, `GET .../state/{student_id}/{concept_id}` and `GET .../history/{student_id}` are all unused, and no file in `src/lib/api` touches them | FRONTEND | M |
| Completion write — `assignmentId` | PARTIAL | `ProgressWrite.assignmentId` is typed at `lessons.ts:217` and **sent by nothing**. The id is already in memory from the dashboard read, so progress cannot be tied back to the assignment that caused it | FRONTEND | S |

## S-A. Buildable today — priority order

Nothing on this list is waiting for anybody. The first four are the ones that change what
a child experiences rather than what a screen looks like.

**Struck through are shipped. Items 1, 2, 3 and 10 landed on 16 Sep, items 4 and 11 on
17 Sep, and items 6, 7, 8 and 9 on 18 Sep. Everything unstruck below is still open.**

**MORE SHIPPED OFF-LIST THAN ON IT, which is worth knowing before trusting the numbers
here.** Six of these were never list items: the parked baseline proves whose it is before
it is sent and a withdrawn guardian stops the profiling run (16 Sep, drift audit); the
rotate prompt has a way through (17 Sep, S-C 8); the engine's proactive instruction
reaches the screen and the code no longer names a child's state (17 Sep, S-B 1); Slower
reaches live content and holds for the lesson (17–18 Sep, S-B 4); the shared-device picker
and the join-link hand-over (18 Sep, S-C 1); two fixture leaks emptied, one of which
reached signed-in children (18 Sep); and the PIN could not be typed on a laptop on EITHER
door (18 Sep) — the unlock screen's field was never focused, and the unknown-device screen
had no field at all while the on-screen pad hides itself when it sees a real keyboard.

**Priority as design set it on 17 Sep — affect and density first — is now spent: affect
is done and Slower shipped. The one piece of density still blocked is Simplify, and it is
FROZEN rather than queued: design escalated the `textVariant` question directly and the
instruction is to build nothing that depends on either field until it is answered. See
`BUILD_STATUS.md`.**

1. ~~**Store the session an invite-link child is now handed.**~~ **DONE 16 Sep (#414).** Stored at the call site, not inside `acceptJoin`, because the teacher path redeems the same link and signs in afterwards. Delivery A, today. Declare
   `session` and `consentStatus` on `acceptJoin` (`invites.ts:160`) and `setSession` from
   it. Until this lands, every invite-link child finishes onboarding unauthenticated, and
   everything downstream of that — their first lesson, their progress, their baseline —
   is attributed to nobody. **S, and it was the recorded launch blocker.**
2. ~~**Read the five 401 codes.**~~ **DONE 16 Sep.** Another session landed the transport and the console screens (#422); the child’s half followed (#424). The reason travels as `?reason=`, not as new routes. Delivery C, today. One change at `client.ts:244` →
   `handleAuthFailure`, then branch: `account_paused` to the screen that already exists,
   `session_revoked` to the frame that has existed since 10 Sep, `session_replaced` to
   frame 28. **`client.ts` is shared by all three consoles, so doing it here delivers the
   teacher console's list-A item 9 at the same time.** **M**
3. ~~**Write the calculation adapter.**~~ **DONE 16 Sep (#423).** Also added a text step kind, because two of the algebra lesson’s three steps had no kind to be, and fixed `commitNum` comparing every typed step against the LAST step’s answer. Delivery B, today. Type the six `CalculationStep`
   fields the wire now carries, then write `segmentFor`'s calculation branch. Per-step
   `answer` drives each step; a numeric answer stays a number so nothing parses it back,
   and a string stays a string so `3/4` does not stop being a fraction; `expectedInput`
   picks the control; a selection or drag step now always has at least two `options`.
   **This is the one item that turns a screen the product is sold on from unreachable
   into live.** **L**
4. ~~**Stop dropping `conceptId` and `explanation` in `assessmentFor`.**~~ **DONE 17 Sep,
   and it was one field rather than two.** `conceptId` was genuinely dropped and now rides
   `AssessmentQuestion`, which retired a backend blocker that was never real. The
   `explanation` half of this entry was WRONG: it already renders as `correctNote` on a
   correct inline check, and the after-lesson miss copy is deliberately the product's own
   sentence (`checkpoints.ts:129`) rather than the authored line. **M**
5. **Render the teacher's note.** `AssignmentResponse.note` is typed and thrown away.
   **MOVED TO LIST S-C (design) ON 18 SEP, not built.** The note reaches the child on
   `students/me/dashboard` and `useStudentDashboard` passes it through, so the data is
   here — but **neither frame 19 (Home Dashboard) nor frame 21 (Lesson Preview Sheet) has
   a slot for it**, checked. That is the `highlights` situation, where design ruled "do
   not build a surface for it". One difference makes it worth asking rather than closing:
   a teacher deliberately typed these words TO this child, so withholding them is not
   neutral the way withholding a generated highlight is. See S-C 11. **S once sited**
6. ~~**Bounce a signed-in child off `/student/onboarding`.**~~ **DONE 17 Sep (#443).**
   The root only — onboarding ends by storing the session, so the later steps are
   legitimately reached WITH one. A trailing slash bypassed the equality check and fell
   through to the pre-auth allowance, which is fixed and tested. The guard had no tests at
   all, so the whole student branch is now covered. **S**
7. ~~**Fix Subject Detail's lesson list.**~~ **DONE 18 Sep.** It showed the whole-student
   history under one subject's heading. `LessonProgress` carries no subject, so it could
   not be filtered here — the narrowed `progress/{subject}` read was already being made
   for its `reflection` and its lessons were being discarded. **S**
8. ~~**Declare `modules` on `LessonDetailResponse`**~~ **DONE 18 Sep** in the student
   lane. Verified against the deployed spec rather than the docblock: both detail paths
   resolve to the same schema and `modules` is in its `required` list. Typed optional
   anyway — required in today's document is not present in every deployment a school is
   running. **`useLessonDetail` (teacher lane) still makes the second call**; the type is
   shared, so it is a six-line change for that lane to take. **S**
9. ~~**Send `assignmentId` on the progress write.**~~ **DONE 18 Sep — and "already in
   memory" was wrong.** The student lane reads no assignments in the player: its route is
   `/student/lessons/{id}`. The id now rides the link from the card that was tapped
   (`?assignment=`), read on the server like the join link's `?token=`. Omitted rather
   than nulled when a lesson was opened from the library, because absent means "not set
   work" and a null asserts the same thing in a field the backend may read differently.
   **S**
10. ~~**Flush a parked baseline vector outside onboarding.**~~ **DONE 16 Sep (#414),** with the ownership guard that had to ship beside it. Today a returning child's
    held measurement never sends. **S**
11. ~~**Wire `record-review`.**~~ **DONE 17 Sep,** on the back of item 4: the write is
    posted once per lesson, filtered to the questions that actually came in as review, so
    a lesson with no review content sends nothing rather than an empty call. **M**
12. **The Lessons tab pair** — show `subject` and `estimatedMinutes`; make "Clear search"
    clear the status chip too. **S**
13. **Mark a thread read, and mark a notification read.** Both endpoints deployed, both
    called by other consoles. **S**
14. **Scope an Ask Nevo question to the lesson the child is in.** `lessonId` is
    structurally null today. **S**
15. **Ask Nevo conversation history.** Endpoints deployed, types already written. **M**
16. **The small honest ones** — the fourth `LessonMessage` for a missing lesson; the
    summary route applying the player's own `lesson.summary` gate; the unreachable
    baseline failure state; the `linkError` prop that has no caller; PIN creation naming
    the failure that actually happened; the avatar selector; the inert top-bar avatar;
    the flanker's `congruency` tag. **S each**
17. **The scaffolds subsystem** — three deployed endpoints with no client module at all.
    Worth a scoping pass before it is sized. **M**
18. **Tell a teacher when their upload was silently degraded.** Traced 16 Sep after
    backend flagged the Zero-Tag rejection. `UploadWizard.tsx:285-290` awaits the parse run,
    tests `run.status === "failed"` and nothing else, then walks the teacher into the review
    screen. A Zero-Tag rejection does not fail the run — it completes, having fallen back to
    splitting the source, so the teacher reviews split-up source text believing it is
    generated content. **`fallbackSegmentCount` is in the same object the wizard already
    polls**, is typed at `content.ts:133`, and carries a docblock calling it "THE FIELD THAT
    MATTERS" — and no screen reads it. When it equals `segmentCount` the lesson is entirely
    fallback. The wizard's existing `fallback` phase is a different thing (an unreadable
    file), so this needs its own state. **S, and it is the twelfth field on the "written but
    never read" list.** Teacher-lane file, student-lane finding — raised to that session.

## S-B. Blocked on backend — the exact ask

Each re-checked against the deployed spec on 16 Sep.

**THREE OF THESE LANDED ON 20 SEP AND NOBODY NOTICED — re-checked 21 Sep.**
Items 13, 14 and 15 are delivered: `ProactiveAdjustmentResponse.hint`,
`ProactiveAdjustmentResponse.guidedQuestions`, and `CalculationVariant.manipulative`
with a new `Manipulative {kind, parts, rows, labels}` schema. Asked 17 Sep,
answered in three days, **and all three are unconsumed** — nothing in `src/`
reads any of them.

They arrived as **four new schemas with no new paths**, which is why no
path-count check saw them: the spec went 192 → 192 paths and 343 → 352 schemas.
*A field added to an existing response is the delivery shape this project keeps
missing.* Diff schemas, not paths.

What they unblock is not small. Items 13 and 14 are the **affective layer**,
filed below as FIXTURE-ONLY with "there is no affective transport at all" — and
frontend §2 puts latency and affect behind three of the four affective states.
Item 15 is the **calculation solver**, also FIXTURE-ONLY. Both are on the child's
daily lesson path.

| Blocked | The ask |
|---|---|
| 1. ~~Affective adaptation~~ **MOSTLY WRONG, corrected 17 Sep (#441)** | The transport exists and is `AdaptResponse.proactiveAdjustment.action`, typed at `intelligence.ts:151` and read by nothing until #441. **The zero-match search was the error, not the finding:** frontend §4 says the frontend receives an INSTRUCTION and never knows which state is active, so the absence of `affect`/`frustration`/`boredom` on the wire is the design working. Do not re-run that search and re-draw this conclusion. `modulate_density` and `increase_difficulty` are applied; `offer_break` had a richer seam already. **Two narrow asks survive, as rows 13 and 14** |
| 2. Break and boundary signals | `break_start`, `break_end`, `feeling_checkin`, `module_boundary_reached` and `module_boundary_action` are absent from `SignalEventType` (27 values). The consolidation break asks a child how they feel and the answer is discarded |
| 3. An assessment-attempt store | Nothing in the 188 paths reads back a child's per-question answers. `POST /api/mastery/update` is a mastery update, not an attempt record. Today "Review answers" works only in the tab the child answered in |
| 4. Reading-density reshapes — **NOW ONE THIRD OF WHAT THIS ROW USED TO SAY** | Design split the control on 17 Sep and was right to. **Slower shipped** — it is not a rewording but "how much arrives at once", so the chunked flow the `attention` accommodation already used delivers it from the body the lesson has, with no authored content. **Expand is deferred** — it needs text that does not exist. **Simplify is the only blocked third**, and it now travels with a bigger question: the player never reads `textVariant` at all (it builds text from `segment.body`), so `keyPoints` has no reader in the child's app, while the teacher's review screen reads `textVariant`. One backend answer settles both — see the `textVariant` row below. Two other things this row wrongly swallowed: the ENGINE's `modulate_density` is a UI treatment, needs no content, shipped 17 Sep; and `slowerSteps` was authored all along (below) |
| **FROZEN 18 Sep — what is `textVariant.body` relative to `segment.body`?** | **Design's instruction: build nothing that depends on either field until this is answered, including Simplify.** Escalated directly to Teslim as urgent rather than queued. If the inference holds, the teacher approves `textVariant` and the child reads `body` — so the approval gate protects text no child sees, and the text a child reads was reviewed by nobody. Design: this is the THIRD time the wire and the design have described different products (dimensions, `expectedInteraction`, this); a fourth should be raised the same way, as an inference flagged as one, before building either side. Found 17 Sep. `LessonSegment` carries both. `fromContent.ts:143` builds the child's text from `segment.body` and nothing student-side touches `segment.textVariant`. The teacher's `LiveVariantReview` reads `textVariant` and says "Nevo has not generated a written version of this section" when it is null. **Inference, flagged as one: `body` is parsed source and `textVariant` is generated — in which case the teacher approves one text and the child reads another.** Also asks whether `keyPoints` is a terser rendering of the whole segment (Simplify ships free) or highlights beside it (it cannot be Simplify) |
| 5. Baseline and warm-up items | `BaselinePromptResponse` is `{dimension}`. Every stimulus and every answer is hardcoded, so the daily warm-up asks the same question each time that dimension comes round |
| 6. A session id a child can address | Same as teacher item 0b. `GET /students/{id}/sessions/{session_id}` needs a uuid nothing returns |
| 7. Student SSO | `SsoStartRequest` needs `provider`, and `SchoolCodeResponse.authMethod` names only the *method*, never the vendor. Children at an SSO school cannot sign in |
| 8. Ask Nevo handoff | `AskNevoAnswer` carries no boundary field, so "I can't help with this, ask your teacher" cannot be triggered by anything |
| 9. `currentPin` on the PIN change | Frame 27 draws three steps beginning with the current PIN; no such field exists anywhere |
| 10. A lesson description | The preview sheet's plain-language description has no field on any lesson schema |
| 11. **Visual generation is failing** | Not a schema gap — every image 400s, so `visualVariant` is null library-wide, the visual channel is dead and the modality-suggestion pill is structurally unreachable. Backend has the diagnostic deployed |
| ~~13. `offer_hint` has no hint to show~~ **DELIVERED 20 Sep** | `ProactiveAdjustmentResponse` now carries **`hint`**. Asked 17 Sep, landed 20 Sep. **Unconsumed** — nothing in `src/` reads it. The original reasoning stands and is why the field was needed: `reason` is the reasoning frame 38 forbids showing, and `confidence` is an engine parameter rule 3 keeps off every screen. `FrustrationHint` takes a string and now has one |
| ~~14. `show_socratic_panel` has no questions~~ **DELIVERED 20 Sep** | `ProactiveAdjustmentResponse` now carries **`guidedQuestions`**. `ConfusionSupport` takes 2-3 guided prompts and there is now a field for them. **Unconsumed** |
| ~~15. `CalculationVariant` carries no manipulative structure~~ **DELIVERED 20 Sep** | `CalculationVariant.manipulative` now exists, typed as a new **`Manipulative`** schema `{kind, parts, rows, labels}` with a `ManipulativeKind` enum — exactly the `kind, parts, rows` that frontend §4 specifies, plus `labels`. **Unconsumed.** This is what `expectedInput: "drag"` on generated content was refused for, and what §4's *"the one place modalities layer rather than switch"* was waiting on |
| 16. **`proactiveAdjustment.action` has no enum** | Documentation, added 17 Sep. A bare `string`, so §4's six values are the design's list and not the contract's. Unrecognised values resolve to null and render nothing, which is safe — confirming the vocabulary turns a guess into a contract |
| 12. **Zero-Tag rejects ordinary English** | Raised by backend 16 Sep: "treatment", "be patient" and "water treatment" are refused, and a lesson containing one degrades silently to deterministic splitting. Flagged as a compliance decision rather than a bug. **Not a backend ask — traced 16 Sep and the frontend half is ours: the teacher is told nothing.** See S-A item 18 |

## S-C. Blocked on design

1. ~~**Frame 28c does not exist.**~~ **DELIVERED 17 Sep AND BUILT 18 Sep (#455, #457).**
   The longest-standing student blocker, closed. The tablet remembers up to six children,
   ages them out after thirty days, and asks which one is here; a join link arriving on a
   signed-in tablet hands the tablet over rather than onboarding under the wrong session.
   Three departures from the frame are flagged in `BUILD_STATUS.md`: the avatar shape is
   stored per child rather than derived from list position, the picker shows even for a
   single remembered child, and landscape padding follows the frame's declared grid rather
   than its stated padding, which disagree with each other.
2. ~~**What the Interactive channel IS.**~~ **RULED 17 Sep: do not build against
   `expectedInteraction` either way.** The wire sends a question; the player draws tickable
   steps; the field defaults to `teacher_review`. Design's ruling is that the frontend
   builds no behaviour on it in either direction, and flags anything else of that shape.
   Closed as a question, open as a standing instruction.
3. **The calculation scaffold** for anything that is not two like fractions, and whether
   `scaffoldImage` replaces the drawn bar model.
4. ~~**A slot for `highlights`**~~ **RULED 17 Sep: do not build a surface for it.**
   Required on the wire, carried to the screen, and it stays carried and unrendered rather
   than being given a home that would be fabrication.
5. ~~**The invented class list** at a real URL,~~ **DELETED 18 Sep (#451)** — fourteen
   invented class names rendered whenever no school code had verified, which was not only
   the walkthrough: a child who typed their real code in a private or storage-blocked
   browser landed there too. **What remains for design is the second half only: whether
   the demo walkthrough should be reachable by typing a URL at all.**
6. **QR scanning** — whether pointing a child at their device's camera app is the accepted
   path, given this is the primary button on the welcome sheet.
7. **A system voice reading to six-year-olds** in a calibration activity.
8. ~~**No escape from the rotate prompt** — SEND-relevant.~~ **RULED AND SHIPPED 17 Sep
   (#435).** Design: *"Build it now."* A tablet clamped to a wheelchair tray does not turn,
   so "My tablet doesn't turn" lets the child through and is remembered per device. Verified
   in a real 700x300 viewport, where the escape was clipped below the fold and both Welcome
   buttons behind it were too.
9. **A done state for the daily warm-up**, which is currently re-sittable any number of
   times a day.
10. **The nothing-landed result copy**, and **`invalid_session`** — whether it needs words
    of its own.
11. **Where the teacher's note goes.** Added 18 Sep, and the reference from list S-A item
    5 that had nowhere to point until now. `AssignmentResponse.note` reaches the child on
    `students/me/dashboard` and `useStudentDashboard` passes it through, so the data is
    here — but **neither frame 19 (Home Dashboard) nor frame 21 (Lesson Preview Sheet) has
    a slot for it**, checked. That is the `highlights` situation (item 4), where the
    ruling was "do not build a surface for it". **One difference is why this is asked
    rather than closed the same way: a teacher deliberately typed these words TO this
    child, so withholding them is not neutral the way withholding a generated highlight
    is.** Small once sited.
12. **Four PIN boxes or six.** Raised 31 Aug and still open, now re-drawn. `STUDENT_PIN_LENGTH`
    is 6 to match the accounts backend issues; frame 00 draws four and says "try 1234",
    and **28c drew four again in both orientations on 17 Sep**. The disagreement did not
    get resolved, it got redrawn. A child with a six-digit PIN on a four-box screen is
    told their PIN is wrong, because the login screen cannot tell a rejected PIN from a
    rejected identifier.

## S-D. Not a gap — do not re-open

- **A child cannot start a conversation with a teacher.** `MessageRecipientType` has no
  `teacher` value and the reply path is deliberately shaped so access IS the thread.
- **Forgot PIN calls nothing.** The frame is informational; `auth/pin/reset` is
  deliberately uncalled.
- **Engine parameters are never rendered** — Zero-Tag ruling. `stability`, `difficulty`
  and `retrievability` are typed because the contract sends them and shown to nobody.
- **Only observed facts are sent to the adaptation engine.** Inventing `engagementScore`
  or `comprehensionScore` escalates a live break from `mild` to `high`. Measured, not
  assumed.
- **Downloads are hidden from signed-in children.** The endpoints exist; the device half
  is a Service Worker project and pretending otherwise would be a lie about offline.
- **`/student/onboarding/*` stays unguarded.** It is the flow that creates the session.
  Only the root needs a bounce.
- **Signing out is not forgetting the device** — deliberate and tested; design confirmed
  15 Sep that 28c does not overturn it.
- **No copy guesses a child's pronoun.** Singular they; a test fails the build otherwise.

## The student console's own cross-cutting caveat

**There is no signed-in student E2E, at all.** `e2e/` holds four specs and the only
signed-in one is `teacher-signed-in.spec.ts`, which `test.skip`s without secrets that do
not exist. So every verdict of LIVE above rests on unit tests, on the deployed spec, and
on reading the code — **not one of them rests on a real child's session reaching a real
backend.** Given that eleven of the defects in this table are "a field nothing reads",
which is exactly the class of defect a passing unit test cannot see, that gap is the one
to close before the console is called finished.

**Nothing in this lane has been checked against its design frames since 8 Sep.** The admin
console had 74 findings confirmed in a frame-by-frame pass this week and the student
console has never had one. On the admin evidence, expect a comparable number here.

**House rule check, 16 Sep.** The "60 dashes remain in the student and admin consoles"
figure in the teacher section counts code comments. In student **user-facing copy** there
are exactly three: `HomeDashboard.tsx:202`, `LessonPlayer.tsx:804` and
`ProfilingIntro.tsx:82`. The admin console's share is a separate count.
