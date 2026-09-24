# Nevo frontend — what is left

Last updated **16 September 2026**. Written from a survey of the source and the
deployed OpenAPI document, not from tickets.

**Start with the section directly below.** It is the only measured, whole-product
view in this file; everything after it is per-area detail, and some of it predates
that measurement.

Keep this current. Three rules make it useful rather than decorative:

1. **The deployed OpenAPI document is the contract.** Handoff docs have diverged
   from it on every item checked so far — `options` as strings where the schema
   says objects, `position` as an integer where it is a string, "everything
   optional" where `required` lists all seven fields. Run `scripts/api-audit.mjs`
   before believing a summary.
2. **Say which pile a thing is in.** "Not done" hides the difference between work
   we can do today and work nobody can do yet.
3. **A BLOCKER IS NOT BELIEVED UNTIL IT IS RE-DERIVED. Added 16 Sep, after four
   separate claims in this file failed verification in one afternoon** — the
   admin blocked table (two rows had shipped the day before), "still buildable:
   NONE" (eleven items), "fifty unchecked `TODO(api)` markers" (43, already
   checked), and "fixture marking CLOSED" (four unmarked surfaces, one of them
   reaching a signed-in child). Every one decayed in the SAME direction: recorded
   as blocked when it was buildable, or done when it was open.

   The mechanism is always the same — **the thing that resolves a row never edits
   the row.** Backend ships an endpoint; the comment saying it does not exist
   stays where it is. So:

   - Before you plan around a blocker, re-derive it. `node scripts/api-audit.mjs`
     takes under a minute and would have caught all four.
   - **A count is not a measurement.** "50 markers" is not "50 problems", and
     promoting one into the other is how item 3 of the admin handoff was wrong.
   - **GREP FOR THE CAPABILITY, NOT FOR THE NAME WE PROPOSED. Added 21 Sep.**
     We asked backend for a certificate expiry and named it
     "certificateExpiresAt". They built "credentialExpiresAt",
     "credentialExpiresInDays" and "credentialExpiringSoon". Every re-check
     afterwards searched for the word in OUR ask — this file recorded
     *"certificate is 0 occurrences spec-wide"*, which was **true, and meant
     nothing**. The row stayed marked open for a day after it shipped, and the
     person who caught it had made the same mistake that morning filtering on
     /cert/i. A capability we ask for is very often delivered under a name we
     did not choose, because backend names it from their model and we name it
     from our screen.
   - **A NEW ENDPOINT NOBODY CALLS IS INVISIBLE TO EVERY GATE WE HAVE.**
     scripts/contract-check.mjs check 2 lists spec fields the client ignores —
     but only on endpoints the client already calls. A whole resource we have
     never touched produces no output at all, from any gate. That is exactly
     how the age-check surface sat unbuilt and unreported. **Diff the spec's
     path list, not only its schemas.**
   - When a claim here is falsified, **retract it in place rather than editing it
     silently**, so the next reader can see the direction this file drifts.
   - The highest-yield question is not "what is blocked?" but **"what shipped
     that we never noticed?"** Five deployed capabilities currently have zero
     consumers in `src/` — see the section below.

---

> **What is undone on the teacher and parent consoles now lives in
> [`docs/CONSOLE_INVENTORY.md`](./CONSOLE_INVENTORY.md)** — one table, every line carrying
> the `file:line` or spec quote that decided it. It exists because "is the console
> complete?" got a different answer every time it was asked, each one re-derived from
> grep and memory. Read and update that file rather than rebuilding the answer. The
> sections below remain the narrative record; the inventory is the current state.

## THE ARCHITECTURE CHANGED UNDER ALL THREE SESSIONS. 17 Sep.

Product issued **v3.0 of the cognitive architecture** on 16 Sep. Both documents are
now in the repo as markdown, and they are binding:

- [`docs/architecture/cognitive-architecture-shared.md`](./architecture/cognitive-architecture-shared.md)
  — what the product is and why. Shared with backend and product, so a change to it
  is a three-way conversation, not a frontend decision.
- [`docs/architecture/frontend-architecture.md`](./architecture/frontend-architecture.md)
  — what this codebase is allowed to do.

**They supersede `docs/architecture.md` and the specs in `context/`.** Those still
exist and still read as authoritative, which is the trap — `architecture.md` cites a
"Design System v2" and a Frontend Architecture spec that v3.0 replaces wholesale.
Do not build from either again.

`AGENTS.md` now carries the ten rules and a read-before-you-build table, so every
session loads them without anyone having to remember to say so.

### The gate, and the three findings standing on main

`npm run architecture` (`scripts/architecture-check.mjs`) checks the rules a parser
can check: Zero-Tag names, a modality on a person-shaped type, the wall clock on a
signal, a result shown to a child, reward mechanics, gendered pronouns in copy. It is
~~warn-only in CI until these three are closed~~ **BLOCKING since 23 Sep - all three are closed and `npm run architecture` exits 0** — gating now would make every
session's first merge red for something they did not write, which is how a gate earns
a permanent `--warn` and stops meaning anything. Close them, then delete the flag.

| | |
|---|---|
| `hooks/useSignals.ts:178` and `:188` | Every interaction event is stamped `new Date().toISOString()`. Frontend §2 requires `performance.now()`: clock skew across devices corrupts every latency measurement, and latency is the primary signal for three of the four affective states. **Not a one-line fix** — it needs agreement with backend on what the engine expects on the wire, so it is a conversation with Teslim before it is a commit. |
| `teacher/Student/SessionPanel.tsx:126` | `title="Took her time here"` — a tooltip a teacher reads about a specific child, using a pronoun no field stores. One line. |

Zero-Tag itself is **clean**: no learner type, learning style or per-child modality
anywhere in `src/`. The gate now holds that true rather than trusting it stays true.

### One contract question nobody has asked yet

`GET /api/session/state/:student_id` — the single endpoint the entire frontend
document is built on, returning next content, scaffold level, affective intervention,
accommodations, review queue and module position in one payload — has **zero
references in `src/lib/api/`**. It may exist under another name, or it may be a
contract that was never cut. Re-derive it against the deployed spec
(`node scripts/api-audit.mjs`) before anyone builds to it, and per frontend §7, if the
contract and the document disagree, say so before building either one.

---

## SHIPPED AND UNCONSUMED — check this before you check anything else. 16 Sep.

**Six deployed capabilities have zero consumers in `src/`.** Nothing is blocked
on them; nobody noticed them. This is the most expensive category in the project,
because a missing endpoint stops one screen while an unnoticed one silently
freezes a whole lane's plan — and two of these sit INSIDE documents that argue
the opposite.

| capability | state | what it unblocks |
|---|---|---|
| `POST /api/v1/users/me/profile-photo` + `ProfilePatch.profileImageUrl` + `CurrentUserResponse.profileImageUrl` | Shipped. **`grep -rn profileImageUrl src/` returns 0 across 681 files** | The real avatar on admin Settings › Your account, the shell, Team and Teachers. `lib/api/users.ts:22-33` never declares the field, so it is dropped from a response the console already receives on every `/users/me`. The proxy forwards multipart and passes bytes, so the upload is reachable today. **`docs/api-requests-admin.md` quotes the full `CurrentUserResponse` field list — `profileImageUrl` included — inside the very sentence arguing Settings is blocked.** |
| `GET /api/v1/consents/rights-log` | Live, paginated, filterable, **0 callers** | D22's parental-rights claim gets a measured figure instead of a mechanism with no number. Built to this frontend's own privacy spec: `reasonRecorded` is a BOOLEAN so the parent's free text never crosses the wire. `ndpaClaims.ts:57` still says "nothing reads one back", which is now false and is single-handedly holding the claim in the unverified state. |
| `GET /api/v1/classes/{class_id}/insights` → `ClassInsightsNarrativeResponse` | Live, **0 callers** | **TEACHER LANE, and the largest single find.** `useClassInsights.ts:14` asserts *"There is no `/classes/{id}/insights`"* and names C09's written summary and C14 A2's "looking ahead" as having no source. The endpoint returns **both, by name**. `CONSOLE_INVENTORY.md:112` already records it as landed — the hook's own docblock is what is stale. |
| `POST /api/v1/students/{student_id}/pin/reset` — and `POST /api/v1/auth/pin/reset` | Both live, **0 callers between them** | Nothing anywhere in the product can reissue a child's PIN, while the child's own Forgot-PIN screen promises it and `NotificationType.pin_reset_requested` delivers the request to a surface that cannot act on it. The only two mentions in `src/` are docblock prose at `ForgotPinScreen.tsx:14,17` — the second of which explains why the `auth/` variant is not called THERE, which is correct and is not an argument against the admin-scoped one. |
| `GET /api/transformation-metrics` with `scope` + `cohortId` | Live, **already typed** at `analytics.ts:89` | Makes the Reports adaptations panel cohort-narrowable. `ReportsView.tsx:86` asserts no read behind that screen takes a cohort parameter; one of the three does. |
| `GET`/`PUT /api/v1/settings/me` | Live; the spec's OWN descriptions say the legacy pair is superseded | `lib/api/settings.ts:113,117` still call the unversioned `/api/settings/me`. Both hit the same column so nothing is broken — but it is a documented deprecation with the migration shape spelled out, and cheaper now than after launch. |

**One that is live and must NOT be wired without a ruling:** `GET /api/v1/ops/overview`
and `/api/v1/ops/feedback`. `OpsOverviewResponse.schools` is plural and
cross-school — this reads as an internal Nevo ops dashboard, and building it into
the SCHOOL admin console would show one proprietor data about every school.


## WHERE THE PRODUCT ACTUALLY IS — measured 10 Sep

Assessed against the deployed OpenAPI document, the design repo and a worktree
pinned to `origin/main`. Every headline below was re-verified by hand, not taken
from an agent.

**80% of screens are built. Close to 0% of the product is usable end to end**,
because every console is missing its front door. This is not a "last 20%"
problem — it is a small number of missing entrances in front of a great deal of
finished work.

| console   | screens             | usable               | demoable  | hours   |
| --------- | ------------------- | -------------------- | --------- | ------- |
| Student   | 51 / 63             | **no**               | **no**    | 135     |
| Teacher   | 22 / 29             | partly               | with care | 115     |
| Admin     | 41 / 51             | partly               | with care | 80      |
| Parent    | 3 / 3               | **no** (unreachable) | with care | 31      |
| **total** | **117 / 146 (80%)** |                      |           | **361** |

Screen counting is judgement-heavy: two independent passes over admin gave 50/63
and 41/51. The RATIO held at ~80% both times. Treat denominators as ±15%.

**API: 132 of 183 endpoints (72%) are truly reachable**, not the 87% a naive
path-match suggests. **27 are referenced but never called** — the recurring
shape being a typed client method with no caller.

### The three missing doors — fix these before anything else

1. **`/admin/onboarding` is unlinked.** Only references in `src/` are
   `proxy.ts:52` and `AdminShell.tsx:19`, both config. The landing page's only
   `href` is `mailto:support@nevolearning.com`. No school can sign up.
2. **The student school-code box holds 4 characters** behind a hardcoded `NEVO–`
   prefix (`SchoolCodeInput.tsx:11`, `SchoolConnectionStep.tsx:69`). Issued codes
   are 8 chars — `751A1136`, `BGA-4827`. `SchoolCodeRequest` is an exact lookup,
   so no server-side normalisation can rescue it. Continue is disabled until it
   verifies. **No child can create an account.**
3. **Nothing can invite a parent.** `consentsApi.requestParentConsent`
   (`consents.ts:113`) has ZERO callers. The parent surface is finished and
   merged and **completely unreachable**.

Together these are perhaps 20–30 hours. They convert the product from unusable to
demoable end to end.

### The long pole is not screens

`RENDERABLE = [MODALITY.TEXT]` (`lib/lessons/fromContent.ts:49`). **A live lesson
renders text only** — visual, audio, interactive and calculation never appear
from parsed content. `lesson.assessment` and `lesson.summary` are never set, so
the assessment, summary and review-answers routes 404 on a real lesson id. Nine
built lesson screens are unreachable by a real child. Adaptive multimodal
learning is the product's central claim and it is the one thing that cannot
render on live data. ~44h, and it is product work rather than plumbing.

### The demo hazard to fix first

`useStudentLesson.ts:203` answers a live 404 or failed read with an **authored
fixture of the same id** (`failed: failed && !mock`). A child whose lesson is
deleted or still parsing is handed the photosynthesis fixture — a rich
multi-modal lesson that does not exist in their school's library, shown exactly
when the backend failed. `SampleRegion` is `display:contents`: detectable by a
test, invisible to anyone watching.

Same class, admin side: the getting-started checklist renders steps as OPEN
circles regardless of whether the school has done them. **Measured again 16 Sep:
it is now TWO of five, not three** — the teachers row settled from a count the
screen already held. One of the remaining two ("share your school code") is
unverifiable by design and must stay open; the other two are costed in the
handoff below.

### How far out

**361 engineering hours.** Against observed velocity — 143 PRs merged in 10 days
across three sessions — that is **4–6 weeks to genuinely shippable**, with the
three doors landing in days.

### Stale docblocks are misdirecting people

Four verified wrong in one admin pass: "No reset endpoint exists anywhere in the
spec" (two exist and teacher consumes them), "`GET /api/v1/users/me` is the only
route on that resource" (PATCH is live), `JoinLanding`'s "Students do not have an
activation flow" (they do), `AdminSidebar`'s "TODO(api): a profile endpoint"
(`usersApi.me` is consumed two files away). **43 `TODO(api)` markers remain in
admin components, none re-checked against the deployed spec.** The 7 Sep re-audit
found 17 of 97 markers repo-wide were already stale; assume the same rate here.

### Corrections to things this document previously asserted

- **"The parent surface is complete."** Three of three screens are built and
  merged. Nothing can reach them. Complete and unreachable are different states.
- **Parent sign-in was recorded as needing a design ruling.**
  `POST /api/v1/auth/login/parent` is live in the deployed spec and unconsumed;
  its `contact` field is a bare string, NOT `format: email`, which is very likely
  the SMS-only answer already shipped. Confirm with backend before treating it as
  a design question.
- **D01b ships seven gendered `she/her` strings** (`ParentConsent.tsx` 51, 60,
  138, 139, 169, 293, 299), copied from the Amara frame, written the same day
  backend was flagged for gendered templates. Same bug, ours.

---

## Student sign-in on a new device — RULED AND BUILT, 15 Sep

**Unparked.** Design ruled on 14 Sep and the screen shipped the same day
(`ReturningSignInScreen.tsx`, frame 00c); the identity leak it introduced was
fixed on 15 Sep in PR #398. The history below is kept because the correction in
it is still load-bearing and the shared-tablet sub-case is still open.

**What design chose:** the child types the identifier a teacher reads out, over
a class name-picker. That trades friction for never exposing a roster to anyone
holding a class code, and it needed nothing from backend.

**Two things worth knowing if you touch this screen:**

- **The username field must NOT use `CodeInput`.** It hardcodes `normaliseCode`,
  which uppercases and strips punctuation — `amara.k` becomes `AMARAK` and no
  child can sign in. It is a plain input with `autoCapitalize="none"`.
- **Never store the login identifier as a display name.** The first version did,
  as a stand-in, and the lock screen then read "Welcome back, amara.k" forever.
  Design's assessment: that string is half a credential, on a pre-authentication
  screen, beside a school code the whole building knows. `displayName` is now
  optional on `RememberedProfile`, the real first name is fetched from
  `users/me` after sign-in, and a nameless device says "Welcome back" alone.
  The name read is deliberately NOT awaited — awaiting it put a profile read
  between a child and the lesson they had just unlocked.

**Still open — the shared classroom tablet.** The device remembers exactly ONE
child (`nevo.auth.profile` is a single slot `rememberProfile` overwrites), so
the second child to sign in displaces the first. Design's answer is frame 28c, a
picker holding up to six children by FIRST NAME AND AVATAR ONLY, never full
names, ageing out after thirty days of non-use. Waiting on the frame.

**Note for whoever builds 28c:** "signing out is not forgetting the device" is a
deliberate, tested decision (`session.dom.test.ts`) and design confirmed on
15 Sep that 28c does NOT overturn it — entries expire on age, not on sign-out.

**The original gap, for the record.** A returning child on a new or wiped device
could not sign in. The
Welcome screen offers only "I have a school code" and "I'm joining through my
teacher" and both CREATE AN ACCOUNT; `/auth/login` (`page.tsx:56`) only unlocks a
profile the device already remembers and otherwise redirects into onboarding. So
the child is re-onboarded into a second account and their history is orphaned.
This is the top launch blocker for the student console.

**Not a backend gap.** `POST /api/v1/auth/login/pin` is public (no `security` on
the deployed document) and takes `{school_code, login_identifier, pin}`.
`POST /api/v1/auth/login` and `POST /api/v1/auth/pin/reset` are public and
uncalled too. The obstacle is that `login_identifier` is server-issued and no
STUDENT screen has ever shown one, so a child cannot supply it.

**Correction to the 10 Sep blockers writeup**, which said the identifier is shown
"to nobody — not the child, not their teacher". False. `LiveClassDetail.tsx:122`
shows it to teachers and `StudentDetailView.tsx:228` labels it "Username" for
admins. Only the student surface never shows it.

**Not a missing form — a product decision.** How a child names themselves before
the PIN is the question: pick your name from the class (best for young SEND
learners, needs a new public class-code-keyed endpoint AND a safeguarding ruling,
since it lists children's first names to anyone with a class code); a sign-in QR
from the teacher (no roster exposed, needs a new endpoint); or type the
identifier a teacher reads out (nothing needed from anyone, poor for primary).

---

## Student lane — UDL accommodations, and a signal that would have lied, 15 Sep

Three merged: **#395** (accommodations reach the child), **#397** (observation
copy), **#398** (the username leak above). The parts other lanes need:

**Every UDL accommodation was computed, shown to staff as active, and never
applied to the child.** `toAdaptationPlan` never set
`AdaptationPlan.accommodations`, so it was undefined for every signed-in learner.
The only plan that ever carried one is the authored mock — so **the signed-out
demo visitor got the accommodation and the SEND learner it was built for did
not**, while the teacher screen said "Support Nevo has turned on" and the SENCo
screen called it the accommodation record for the IEP.

**Grep your own lane for this shape:** a field the UI reads that nothing ever
writes. It is the same class as the 27 typed-client-methods-with-no-caller in
the API audit, one layer up.

**The part that could not simply be switched on.** The player calls a segment
fully read when its column has no room to scroll. True for a segment, false for
one chunk of one — a chunk always fits. Turning `attention` on would have
reported every chunked segment as 100% read the instant it opened, and **only
children WITH the accommodation are ever chunked**, so it would have corrupted
the adaptation signal for exactly the learners it exists to help. The chunked
body now reports its own progress and that outranks the layout measurement.

**Two mutations survived and both were real findings** — a guard in the
measurement effect and a `!signedIn` check, each proved inert and deleted rather
than left looking load-bearing. Worth doing on your own fixes: a surviving
mutation usually means the line is dead, not that the test is weak.

**`numerical` gates nothing.** Its docblock claimed it "is carried by the calc
solver's picture-first rendering"; `CalculationSolver` takes no such prop.
Another comment asserting the opposite of the code. Raised with design — either
it gates something or it stops being shown to staff as a provision.

**Observation copy is now design's final wording** (`lib/constants/observations.ts`),
with two behavioural rulings: no sentence ever interpolates the count, and only
`completed_lessons` may carry one — a number beside `revisited_content` undoes
the sentence that stops it reading as "struggles with retention".
`observationCount` takes the pattern now, so the rule is enforced at the source.
**If you render observations anywhere, that signature changed.**

**One house rule that came out of it:** no copy guesses a child's pronoun. Design's
draft said "the lessons she starts"; we store no pronoun for anybody, so it is
singular they, and a test fails the build on any gendered pronoun in the five.

---

## Student lane — measurement sweep, 11 Sep

Seven merged today (#344, #346, #348, #350, #352, #353 and the useStudentLesson
fixture fix). What follows is the part other lanes need: **two corrections to the
audit, two questions for design, and one shape to grep your own lane for.**

### The shape: a comment that rationalises a gap

The strongest one today. `DomainProbeModule`'s note said a prior-knowledge probe
"has no correct option", and `reduceTrialModule` reported `accuracy: null` on that
authority. It was a statement about the DATA STRUCTURE, not about the questions —
"The capital of Nigeria is:" has an answer, and a knowledge probe is precisely the
thing that needs it. The comment is why nobody looked.

Same week: `useSessionRefresh`'s docblock said "retrying a refusal in a loop would
just spend a dying token faster" while looping; `SentenceDotModule`'s
`TODO(audio): real narration asset; the play affordance is the shell` described a
button with no `onClick`, under "Listen, then tap the matching picture", asked of
six-year-olds. **Grep your lane for comments that explain why something is
absent, and check the code agrees.**

### Correction — `/summary` and `/review` are NOT reachable dead ends

An earlier note implied a child finishing a real lesson hits a 404. They do not.
`LessonPlayer:713` gates "See summary" on `lesson.summary`, and the assessment
phase on `lesson.assessment` (`:520`) — real lessons carry neither, so neither
route is ever pushed. This is the known backend blocker (no recap, no assessment
on `LessonDetailResponse`), not a separate frontend defect. Nine built screens
wait on backend; nothing is broken in front of them.

### Correction — session expiry was silent, and is not any more

`getSession()` self-clears at `expiresAt`, after which `report()` returns at its
`!getToken()` guard and no request is made to 401 — so the 401-driven
session-expired redirect never fired and the route guard, which only runs on
navigation, never saw them. `useSessionLapse` (#348) arms a timer for the expiry
instant and re-checks on `visibilitychange`. **Teacher and admin shells do not
mount it.** It is role-aware (`sessionExpiredDoor(role)`) and takes no arguments —
`useSessionLapse()` in your shell is the whole change, if you want it.

### For design — two questions, neither blocking

1. **A synthetic voice reads to P1-3.** Module 3's audio activity had no sentence
   and no asset, so it now uses `speechSynthesis` — the system voice, not a
   produced narration. It is a large improvement on silence and it is not what
   anyone designed. Where speech is unavailable the activity is skipped rather
   than mimed. Worth a view on whether a system voice is acceptable for a
   calibration activity, and on the two sentences themselves.
2. **There is no way past the rotate prompt.** Working as ruled ("portrait only,
   v1"), but a device mounted landscape on a wheelchair tray or a stand, or one
   with rotation locked, has no route into Nevo at all. SEND-relevant rather than
   hypothetical.

### Still open in the student lane

- `PinCreationScreen.tsx` is held by another session — untouched here.
- The daily warm-up's `WarmUpRun.tsx` (528 lines) is not swept yet. It shares
  `BaselineCapture` and the same `trial_pick` contract, so expect the same
  accuracy-key question there. Being taken next by this session.
- Nothing in the lane has been checked against the design frames since 8 Sep.

---

## ACTION NEEDED — PARENT LANE IS BROKEN AGAINST THE DEPLOYED BACKEND, 11 Sep

**A backend deploy has replaced parent password auth with a code flow, and one
client call now 404s.** Found because `scripts/contract-check.mjs` started
failing on `main` — the gate was right and a pinned spec copy was stale.

|          |                                                                                                    |
| -------- | -------------------------------------------------------------------------------------------------- |
| **GONE** | `POST /api/v1/consents/parent/{token}/account` (+ `ParentAccountRequest`, `ParentAccountResponse`) |
| **GONE** | `POST /api/v1/auth/login/parent` (+ `ParentLoginRequest`)                                          |
| **NEW**  | `POST /api/v1/auth/parent/request-code` (+ `ParentCodeRequest`, `ParentCodeSentResponse`)          |
| **NEW**  | `POST /api/v1/auth/parent/verify-code` (+ `ParentCodeVerifyRequest`)                               |

**The live break:** `parentApi.createAccount` (`src/lib/api/parent.ts:246`) is
called by `ParentConsent.tsx:409`. A parent who completes consent and sets a
password now gets a 404 — on the consent flow, which is the most sensitive path
in the product. `/auth/login/parent` has NO caller, so that removal is harmless.

**This is a design change, not a rename.** Parents move from a password to a
requested code, so it needs the two-step flow built, not a URL swap. It belongs
to whoever owns the parent lane.

**The wider lesson, and it applies to every session:** the admin work this week
was verified against a spec copy pinned on 10 Sep. Re-diffed against live on
11 Sep, every admin schema and query parameter was identical — 16 schemas, 3
paginated endpoints, zero drift — so that work stands. But the pin hid a real
change for a day. **Re-fetch before trusting a pinned copy**, and treat a
contract-check failure on `main` as a finding rather than noise: it was correct
here and would have been dismissed as a false positive on the path matcher.

## ACTION NEEDED — student and admin sessions. NOT CLOSED, 16 Sep

**Wrap your fixture fallbacks in `<SampleRegion>`.** Ten minutes each, and the
end-to-end suite is worthless without it.

**A RETRACTION, SAME DAY.** An earlier version of this heading said CLOSED for
both lanes. It was wrong on both halves and is withdrawn. Three independent
passes over the code refuted it; what they found is below. The retraction is left
visible rather than quietly edited out, because the false version sat on a branch
headed for `main` and somebody may yet read it.

**Student lane — nine surfaces wrapped, and every wrap is real.**
`HomeDashboard`, `LessonsTab`, `ProgressTab`, `SubjectDetail`, `ConnectTab`,
`AskNevo`, `StudentShell`, `LessonRoute`, `LessonEndingRoute`, plus
`useStudentLesson`. Each was opened and confirmed to enclose the fallback branch
itself rather than a sibling. That half of the old claim stands — do not soften it.

**STILL OPEN — student lane, and this one reaches a signed-in child.**
`context/NotificationContext.tsx:135-142` returns `MOCK_NOTIFICATIONS` — "A new
lesson is ready / Adding Fractions is waiting for you" and "Ms Okafor sent you a
message / Lovely work on your fractions today" — with no mark.
`NotificationBell.tsx` imports no `SampleRegion`, and `StudentShell` mounts the
bell OUTSIDE both `MaybeSample` wrappers; those cover the identity block and the
avatar only.

It is not merely unmarked, it is **mis-gated**, and that is the half that bites.
The provider reads `useHasSession()` (`NotificationContext.tsx:100`) with **no
`useHydrated()` guard** — unlike every other student surface, each of which added
one and says why in a comment. `useHasSession.ts:32` hardcodes
`serverSnapshot = () => false`, and `NotificationProvider` is mounted in the ROOT
layout, so this is every student page. The server markup and the first client
frame for a genuinely signed-in child therefore carry `unreadCount = 1`: the
violet unread dot renders with no click, and the panel lists invented rows naming
a teacher who sent nothing. **Fix the gate and the mark together — the mark alone
leaves the flash.** The live path is already right, and is worth preserving: a
failed read sets `feed: []` and `failed: true`, deliberately never the fixtures.

**UNMARKED AND UNGATED — student onboarding.**
`ClassConfirmationStep.tsx:37-51` defines `DEMO_CLASSES`, fourteen invented class
names, selected at `:78-82` whenever `verified` — `Boolean(draft?.schoolCode)` —
is false, and rendered at `:258`. The file has **no `SampleRegion`, no
`sampleMark`, and no session gate at all**. `getOnboardingDraft()` returns `{}`
both when no school was verified AND when the sessionStorage write silently failed
(`lib/auth/onboarding.ts:41-49` — `mergeOnboardingDraft` swallows that error on
purpose, "Private mode etc."). So a child who verified their real school code in a
private or storage-blocked browser is shown fourteen invented classes with no
mark, and `pick()` at `:139` then writes `classId: undefined` — the exact failure
the file's own docblock at `:24-35` claims to have fixed. The fix keyed on
`schoolCode`; the storage-failure path does not have one.

**ADMIN lane — two sample surfaces, not one, and the second is HALF wrapped.**
`OverviewView` is correct. The second is `AdminSidebar.tsx`, which renders the
fixture persona "Mrs. Adebayo" on every admin screen. Its
`SampleRegion kind="admin:sidebar-identity"` at `:460` encloses the name/subtitle
block **only** — the avatar disc's hardcoded initials `"AA"` sit at `:419`, on the
same ternary's signed-out branch, OUTSIDE the mark, and the marked block is
additionally gated on `expanded`. Below 1280px the rail collapses and the name
block is not rendered at all, so on the 1024px the admin frames are drawn at, the
entire fixture identity a viewer meets is the unmarked `"AA"`. No `hydrated` gate
on this branch either. **S, and it is one element moved.**

**UNMARKED, but the gate is currently correct** — lower priority, and the reason
the mark exists at all is that a gate can regress:

- `DownloadsTab.tsx:18` — four invented lesson titles with invented sizes. No
  `SampleRegion` in the file.
- `useDisplayName.ts:78-83` — `MOCK_STUDENT` "Ada"/"AK", surfaced by
  `ProfileSettings.tsx:172` and `:214`, which is page content and so sits outside
  `StudentShell`'s wrapper.

**THE TEST THAT ENFORCES THIS NOW EXISTS FOR ADMIN, AND STILL NOT FOR STUDENT.**
`e2e/admin-signed-in.spec.ts` landed 16 Sep (#412), so the admin marks are
asserted against something at last. **The STUDENT lane has no signed-in spec** —
`e2e/` holds `landing-pinned`, `public-pages`, `route-guards`,
`teacher-signed-in` and `admin-signed-in`, and `data-nevo-sample` is asserted on
in the latter three. Marking is necessary and it is not sufficient: until a
student signed-in spec exists, that lane's marks are asserted against by nothing
— which matters most there, because the unmarked notification bell above is the
one that reaches a real child.

**HOW THIS WENT WRONG, because the method is the actual defect.** The claim was
built by grepping the lane for `fixture` and `sample` — which is what the
paragraph below this one tells you to do. **Not one of the leaks above contains
either word.** They are called `DEMO_CLASSES`, `MOCK_NOTIFICATIONS`, `ITEMS`,
`MOCK_STUDENT`, and a bare `"AA"` string literal. The same blind spot produced the
five teacher-lane leaks recorded in `CONSOLE_INVENTORY.md` section E on the same
day. A count is not a verdict either: `grep -rln fixture src/components/admin | wc -l`
returns 14 and means nothing, because it counts test files and docblocks.

**Grep for the SHAPE instead:** every branch that returns invented data when a
read fails or is still in flight, then check each one is gated on
`hydrated && !signedIn` rather than `!signedIn` alone, and that the mark encloses
the whole fallback rather than the half of it that happens to be prose.

The rest of this section is kept as the record of why the mark exists.

Every console falls back to fixture data when a live read fails. That is intentional
for the signed-out demo, and it is also what makes an E2E lie: a test asserting "the
teacher signs in and sees their class list" PASSES when the read 401s, because the
fallback renders a class list — which is exactly what the assertion looks for. The
suite goes green while the console shows invented children to a real person.

The fix is a mark the fallback carries, so a test can see it:

```tsx
// before
if (!getToken() && fixture) return <StudentProfile student={fixture} />;

// after
if (!getToken() && fixture)
  return (
    <SampleRegion kind="student:profile">
      <StudentProfile student={fixture} />
    </SampleRegion>
  );
```

`import { SampleRegion } from "@/components/shared/SampleRegion";`

It renders `display: contents`, so it joins no layout and changes nothing visually.
`kind` names the surface, so a failure says WHICH screen fell back.

The planned E2E signs in and asserts no mark appears anywhere. **An unmarked fallback
is invisible to it** — the test walks past reporting success, which is worse than not
having the test at all.

Teacher lane is NOT done either — `CONSOLE_INVENTORY.md` section E found five
unmarked teacher surfaces on 16 Sep. Wrapped so far: `ClassRoute`, `LessonRoute`,
`StudentRoute`, `TeacherHome`, `InsightsView` — five files, not the three this
line used to name.

**Do NOT find yours by grepping for `fixture` and `sample`.** That is the method
that produced the retraction above; see "Grep for the SHAPE instead".

---

## Parent surface — NEW AREA, started 7 Sep

There are **five** surfaces, not three. Design drew a parent area (3 frames) and an
ops console (14 frames); neither had a route until now. `docs/BUILD_STATUS.md` and the
design flow index both missed this — the index does not list parent at all, because
its screens are numbered as admin follow-ups (D01b, D01c, D15d).

**`/parent/[token]` is built** — D01c Parent Data Management, SCRUM-80. Public and
tokenised: a parent never signs in, because putting a login in front of a statutory
data right defeats the point of having it.

**This is a launch blocker, not a feature.** SCRUM-80: _"Section 31 of the NDPA 2023
requires verifiable parental consent... Our legal review confirms this must be in
place before launch."_

### Two backend gaps found while building

1. **There is no `GET /api/v1/parent/{token}`.** The page cannot resolve the token to
   the child's name, their school, or whether consent was already withdrawn. D01c is
   written throughout in the child's name; none of it can be rendered, and a parent
   who already withdrew sees the actions again on return. The page says "your child"
   rather than inventing a name.
2. **An objection has nowhere to put its reason.** `ParentRightRequest` carries
   `requestType` and nothing else, and the API **accepts and ignores** extra fields —
   `reason`, `message`, `details` and `note` all pass validation and go nowhere. So
   D01c's "Describe your concern" textarea is deliberately NOT built: a parent typing
   into a box that discards it, and being told it was received, is worse than not
   offering the box.

### The enum is not in the spec

`requestType` is declared a bare `string`. The real values came from asking the
deployed API with a bad one:

    String should match pattern '^(request_data|object|withdraw_consent)$'

Pinned by a test so a rename fails loudly rather than 422ing a parent's request.

### SCRUM-80 gating — RULED 7 Sep. Nevo is not the consent gate.

Design's ruling, verbatim in effect: **when the backend says `granted: false`, the
child proceeds normally.** The school warrants consent through the DSA. `granted:
false` means the school has not recorded it yet — their administrative task, not a
blocker for the child.

**One exception: explicit withdrawal.** If a parent withdraws, that child's data must
stop being processed.

**The API already distinguishes the two.** `ConsentStatus` has FOUR values on the
deployed spec, not the two this doc used to claim:

| status      | `granted` | means                         | child     |
| ----------- | --------- | ----------------------------- | --------- |
| `not_sent`  | false     | school has not asked yet      | proceeds  |
| `pending`   | false     | asked, parent has not replied | proceeds  |
| `confirmed` | true      | parent granted                | proceeds  |
| `withdrawn` | false     | parent actively withdrew      | **stops** |

**Three of the four are `granted: false`.** So reading `granted` cannot implement the
ruling — it blocks children whose school merely has not filed paperwork, which is the
exact failure the ruling exists to prevent. **Read `status`.** The single encoding of
this is `processingWithdrawn()` in `lib/api/consents.ts`, pinned by six tests plus a
mutation check.

Done under the ruling:

- `ConsentStatus` corrected from `pending | confirmed` to all four. It was previously
  missing `withdrawn`, which made the withdrawal rule a TYPE ERROR — literally
  inexpressible.
- The onboarding gate call is gone. `ConsentGate.tsx` is now
  `LearningNotice.tsx`: the screen stays (it is what tells a child they are being
  profiled — the only notice they get under a school-warrants model), the gating does
  not. Design asked for the file to be deleted; the file also held frame 14's
  explanation screen, so the gate was removed and the screen kept. **Flagged to design
  to overrule if the screen was meant to go too.**

**STILL OPEN — a design question, not a backend one.** What does a withdrawn child
actually SEE? D01c already promises the parent "your child's account is suspended…
they can no longer access Nevo", but no student-side frame exists for a suspended
child. Either D01c over-promises or a frame is needed. Nothing is invented in the
meantime.

---

## API re-audit, 7 Sep — all 97 `TODO(api)` markers vs the live spec

Every marker in the tree was written against an OLDER spec, and the spec moves daily.
Re-checked all 97 against the deployed document, with each "now unblocked" claim
adversarially verified twice before being called that.

| verdict                 | n   | meaning                                                                  |
| ----------------------- | --- | ------------------------------------------------------------------------ |
| unblocked               | 4   | build it today                                                           |
| **partially** unblocked | 26  | the READ landed, the WRITE (or 1 of 3 needs) did not                     |
| still blocked           | 50  | genuinely absent                                                         |
| **stale**               | 17  | **delete the comment — the need is already met or was never an API gap** |

The 26 are the interesting pile: in nearly every case a screen can now render its data
and still cannot perform its action. Do not read "partially" as "blocked".

### Two live bugs this turned up — FIXED, see the enum-mismatch PR

- **`ClassSource` has no `"sso"` member** (it is `manual | roster_sync`). Both
  `ClassesView.tsx:133` and `ClassDetailView.tsx:133` compared against `"sso"`, so
  `ssoSourced` was permanently false and a provider-owned class was offered Create and
  archive actions the school must not have.
- **A revoked teacher was labelled "Invited".** `isInvited` was `status !== "active"`,
  and `UserStatus` is `active | invited | deactivated`. `GET /teachers` has no
  include-inactive filter, so a revoked teacher returns in the ordinary list.

Both were silent — no error, correct-looking code. **If you fix one instance of a
mismatch like this, grep for siblings**; the second `ssoSourced` was at the same line
number in a different file and was nearly missed.

### Endpoints that exist and nothing calls — 8 rated high value

**FOR THE ADMIN SESSION, the big one: `POST /api/v1/students` is not wired.** There is
no student-create call anywhere in `src/`, and the students screen has TWO "Enrol a
student" buttons (`StudentsView.tsx:159` and `:361`). `students.ts` has patch,
deactivate and restore — no create. Also unwired: `POST /students/{id}/pin/reset`
(referenced only in comments in `ForgotPinScreen.tsx`), and `GET /school/overview`,
`GET /school/narrative` and `POST|GET /school/dpa-acceptance` — the last of which is
the compliance record `DpaStep.tsx` says it cannot persist.

**FOR THE TEACHER SESSION:** `PATCH` and `DELETE /api/v1/assignments/{id}` are both
unused, so an assignment can be created and never edited or cancelled.
~~`POST /api/content/lessons/{lesson_id}/regenerate`~~ **is wired as of 17 Sep** —
"Try that again" on the parse result, via `useLessonRegenerate`. Design ruled it into
v1 rather than as a cheap upgrade, on the grounds that it fixes the lesson IN PLACE:
re-uploading was the only remedy before it, and re-uploading leaves two assignable
lessons with the same title on a product with **no delete on any lesson or upload
route**. That missing delete is still real and is written down here rather than carried
in anyone's head; regenerate reduces its urgency because the main route to a duplicate
WAS the workaround for not having a retry.

### 17 markers to simply delete

Cheap and worth doing: the comment is the only thing left. Notably every `lib/mocks/teacher*.ts`
marker (the C16 intelligence surfaces, C09 insights, teacher home flags and the C01
onboarding round trip all shipped), `lessonCatalog.ts`, `lesson.ts`, `session.ts:137`,
`connectData.ts`, `ProfileSettings.tsx:40` (already implemented in that same file), and
both `TeacherJoin.tsx` QR markers — QR capture is `getUserMedia` plus a client-side
decoder, never an API gap.

---

## HANDOFF — the teacher session changed files in YOUR consoles. 8 Sep.

**Read this if you own the admin or student console.** I crossed into both while acting on
design's SCRUM-80 ruling, and the changes are already merged. Nothing here needs undoing —
it is green and tested — but you should hear it from this doc rather than from a conflict.

**It already cost us once.** While I was typing a consent seam into `lib/api/students.ts`,
the admin session was independently building D07's consent column with the same four
values under a different name. That surfaced as a rebase conflict where both halves were
the same idea. I took theirs and deleted mine. That duplication is exactly what the
console split exists to prevent, and it happened because I followed a contract change
outward into whoever's screens it touched instead of stopping at the boundary.

### FOR THE ADMIN SESSION — three of your files, and two breaking signatures

Merged in PR #285 and PR #283.

| file                                           | what changed                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `components/admin/Teachers/status.tsx`         | rewritten — see the breaking change below                                                               |
| `components/admin/Teachers/status.test.tsx`    | NEW, 7 tests                                                                                            |
| `components/admin/Classes/ClassesView.tsx`     | `c.source === "sso"` → `"roster_sync"`                                                                  |
| `components/admin/Classes/ClassDetailView.tsx` | same fix, same line number                                                                              |
| `lib/api/teachers.ts`                          | added `UserStatus`; `status` narrowed from `string`                                                     |
| `lib/api/classes.ts`                           | added `ClassSource`; `source` narrowed from `string \| null`                                            |
| `lib/api/students.ts`                          | your `ConsentState` now ALIASES `ConsentStatus` — one definition, same four values, no behaviour change |

**Breaking signature 1.** `isInvited`, `isActive` and `StatusPill` now take `UserStatus`,
not `string`. Passing a bare string no longer typechecks.

**Breaking signature 2.** `AdminClass.source` is `ClassSource | null`. A literal `"sso"`
is now a compile error — deliberately, see below.

**The two bugs behind those changes**, in case you would rather re-do the fixes your own way:

- `ClassSource` has no `"sso"` member; it is `manual | roster_sync`. Both files compared
  against `"sso"`, so `ssoSourced` was permanently false and a provider-owned class was
  offered Create and archive actions the school must not have.
- `isInvited` was `status !== "active"`, so a **deactivated** teacher rendered as
  **"Invited"** — telling an admin an invitation was outstanding for someone whose access
  they had just revoked. `GET /teachers` has no include-inactive filter, so it is
  reachable in ordinary use.

**Design ruled on the pill (8 Sep):** keep the third pill, keep the word "Deactivated",
do NOT filter deactivated teachers out of the list — an admin should see who was removed.
D6 goes from two labels to three. The tint and flat treatment as shipped are approved.

### FOR THE STUDENT SESSION — two files, and a screen that was renamed

Merged in PR #283.

- **`components/student/Onboarding/ConsentGate.tsx` is now `LearningNotice.tsx`.**
  The gating is gone; the SCREEN is unchanged. Design ruled that Nevo never blocks on
  consent — the school warrants it through the DSA — so the old
  `GET /students/me/consent-gate` call had nothing to decide and only dev-logged. Design
  asked for the file to be deleted; it also held frame 14's explanation screen, so the
  gate was removed and the screen kept, renamed so nothing reads as a gate again.
- **`components/student/Onboarding/ObservedInteractionSequence.tsx`** — import and usage
  updated to match. Still step 1 of the sequence, between profiling and PIN creation.

**The rule to carry forward, because it is easy to get backwards:** three of the four
`ConsentStatus` values report `granted: false`. Reading `granted` blocks children whose
school merely has not filed paperwork. Read `status`, or use `processingWithdrawn()` in
`lib/api/consents.ts` — one definition, six tests, mutation-checked.

### The Account-on-Pause work is YOURS, not mine

It is student auth and I should not have carried it as far as I did. Everything known is
in the section below: design's ruling, the pushed frame, the six mapped auth surfaces
with hook points, and the measurement showing a paused account is currently
indistinguishable from a wrong PIN. **It is blocked on backend returning a
distinguishable code** — when that lands, it is the student session's to build, not mine.

## Account on Pause — designed, enforced, and NOT WIREABLE. 8 Sep.

Design ruled that a child whose parent withdrew consent is stopped at sign-in with a
calm screen ("Your Nevo account is on pause. If you have questions, talk to your
teacher."). The frame is pushed. Backend enforces it: withdrawal deactivates the
learner, the session dies on the next request, and they cannot log back in.

**It still cannot be built, and the reason is measured, not inferred.** I made a real
student on the E2E tenant, deactivated it, and compared responses:

| case                                | response                               |
| ----------------------------------- | -------------------------------------- |
| active account, **wrong** PIN       | `401 {"code":"authentication_failed"}` |
| **paused** account, **correct** PIN | `401 {"code":"authentication_failed"}` |
| identifier that never existed       | `401 {"code":"authentication_failed"}` |

Byte-identical, message included. Mid-flight a revoked token gets `401 invalid_session`,
which is also what an ordinary expiry returns. `user_unavailable` never reaches the
client and appears nowhere in the deployed spec.

**Do not guess at it.** A wrong guess tells a child who mistyped their PIN that their
account is on pause, which is precisely the harm the copy exists to prevent. Raised with
backend: distinguish only AFTER credentials verify, so nothing leaks to someone who does
not already hold a valid PIN. Our own code already takes that posture deliberately —
`authApi.requestPasswordReset` documents that it "always resolves the same way for any
address".

### What a withdrawn child sees TODAY — every path blames her

Mapped across all six auth surfaces. Five are reachable; student SSO is not (still
`resolveMockSso`).

- **Mid-lesson.** A background read 401s → `client.ts:212` `handleAuthFailure` →
  `/auth/session-expired`, which hardcodes `variant="expired"`: **"You've been away for
  a while."** She was not away. The route's own comment calls it the "idle timeout
  landing", and it is now the catch-all for every 401.
- **Next morning.** The remembered profile is untouched, so the device greets her
  **"Welcome back, <name>"**. She types her correct PIN. `page.tsx:104` collapses 401
  and 403 into one boolean, so she gets **"That PIN didn't match. Try again, or ask your
  teacher."** Forgot PIN → informational → back to sign-in → same loop, blamed each time.
- **A revoked TEACHER** gets the identical wrong-password treatment
  (`TeacherSignIn.tsx:124`).

**The plumbing is already there.** `ApiError.detail` carries the parsed error body
(`client.ts:195-201`, `:214`) and is in scope at every hook point — it is simply never
read. `tosseErrorMessage` (`tosse.ts:155-161`) already narrows `{detail:{code,message}}`,
so there is a precedent to copy. The only missing thing is knowing which code to look for.

**Hook points, when a code exists:** `src/app/auth/login/page.tsx:104` (student PIN),
`src/lib/api/client.ts:211-212` (mid-flight, covers session refresh too),
`src/components/teacher/Auth/TeacherSignIn.tsx:124` (staff).

**FOR DESIGN:** `SessionEndScreen` has two variants and both assert a CAUSE — "You've
been away for a while" / "You logged in on another device". Neither is true for a revoked
session, and there is no neutral variant. Worth a third, or softer wording on `expired`,
independently of the pause work.

## `POST /api/v1/students` returns 500 — raised 8 Sep

Enrolment is broken. Valid payload, healthy tenant:

- fails identically with the three required fields, with `ageBand`, and with `email`
- **validation and lookup are fine** — bad `classId` → `404 Class not found`, missing
  `lastName` → proper `422`. It fails after both, during creation.
- **not the tenant** — `GET /school` and `/permissions/me` read fine, and
  `POST /api/v1/invites` works on the same tenant (201)
- **not the DPA** — accepted `version: "1.0"` (201, reads back) and retried; still 500

`rndr-id`s given to backend: `bb72a09b-7fa7-423b`, `22ca2b26-70b5-4b55`,
`75bde606-1e2e-4e39`, `1ece64bb-d0ac-465c`.

**Workaround for anyone who needs a student:** `POST /api/v1/invites` →
`POST /api/v1/join/{token}/accept` with `{pin, firstName, lastName}` creates one and
returns `loginIdentifier`. That is how the tenant below was seeded.

### The E2E tenant is no longer empty

School `E2E DO NOT USE - automated tests`, code **`751A1136`**. It now holds one class
and two students — one **active**, one **deactivated** — so the console renders populated
states, and the `Deactivated` pill has a real row behind it. DPA acceptance is recorded.
Credentials stay in CI secrets, not here.

---

## D15d Parent Growth View — NOT BUILDABLE. Measured 8 Sep.

The last unbuilt parent frame, and the blocker is bigger than a missing endpoint:
**a parent cannot get a Nevo account at all.**

### 1. `parent_guardian` is invite-refused

`POST /api/v1/invites` declares `role: UserRole` — all five values, `parent_guardian`
included. The deployed endpoint runs TWO validations and the second one is narrower:

```
role: "parent_guardian"   -> 422  String should match pattern '^(teacher|student)$'
role: "not_a_real_role"   -> 422  Input should be 'student', 'teacher', 'senco_admin',
                                  'other_admin' or 'parent_guardian'
```

The enum lets `parent_guardian` through; the pattern then rejects it. **This is also a
contract bug in its own right** — the spec advertises a five-value field that the
implementation accepts two of, so a generated client would 422 at runtime. Raised.

Nothing else mints parent credentials: `/auth/password-reset/*` needs an existing
account, and `POST /consents/parent/complete` returns a `parent_id` for a record that
has no way to sign in. That is the same wall that stops D01b's "Set up my parent
account" button, which is why that button is deliberately unbuilt.

### 2. Nothing in the API is scoped to a parent

`parent_guardian` appears **exactly once** in the whole deployed spec — inside the
`UserRole` enum that defines it. No endpoint references it. There is no
"which children am I the parent of" read; `GET /students/{id}/parent-links` runs the
other way and is admin-scoped. Every progress read (`/api/students/{id}/progress`,
`/api/mastery/student/{id}`) requires `HTTPBearer` and is keyed by student id.

### 3. The data the frame needs does not exist in any shape

D15d is four plain-language statements about how one child is growing this term:

| the frame's four           |                                                          |
| -------------------------- | -------------------------------------------------------- |
| Staying with hard problems | "working through tricky questions on her own for longer" |
| Knowing what she knows     | "a clearer sense of what she has understood"             |
| Connecting ideas           | "carrying what she learns in one subject into another"   |
| Learning new things faster | "new ideas are landing more quickly than last term"      |

**Prose, and the frame is emphatic about it: no scores, no percentages, no labels, no
clinical terms.** So this cannot be derived client-side from numbers — deriving it would
be inventing a judgement about a child.

What exists is close in shape and wrong in scope:

- `GET /api/transformation-metrics` → `TransformationMetricsResponse` is entirely
  counts (`lessonsTransformed`, `adaptationsPerSession`, …). That is D15a-c, and it is
  precisely what D15d must not show a parent.
- `GET /api/v1/school/narrative` → `SchoolNarrativeResponse` `{headline, summary,
highlights, generatedAt, source}` is the RIGHT shape — generated prose with a
  provenance field — at the wrong scope. **It is the model to copy for a per-child
  version.**
- `LearnerObservationResponse` `{pattern, count}` and `LearnerProfileSummaryResponse`
  are declared in the spec and **served by no endpoint at all**. Orphaned.

### What would unblock it, in order

1. Let `POST /api/v1/invites` actually accept `parent_guardian` (or any route that gives
   a parent credentials), and fix the enum/pattern mismatch either way.
2. A parent-scoped read of their own children — the parent equivalent of
   `students/me`.
3. A per-child growth narrative shaped like `SchoolNarrativeResponse`, carrying the four
   dimensions as prose with a `generatedAt` and a `source`, so the screen can say when it
   was written and never has to compute a judgement itself.

Until 1 and 2 exist there is no signed-in parent to show anything to, so this is not a
"nearly there" item. **Parent is 2 of 3 frames: D01b and D01c are built and merged.**

---

## Signed-in E2E — LIVE as of 11 Sep. 9 specs, and how to run them.

The suite is no longer signed-out only. `e2e/teacher-signed-in.spec.ts` holds a
real session against the E2E school and asserts the one property no unit test
can reach: **a signed-in teacher is never shown invented data.**

**Why that is the assertion, and not "the class list appears".** Every console is
live-first with a fixture fallback. "The teacher signs in and sees their class
list" PASSES when the read 401s, because the fallback renders a class list. So
the test asks the question the failure mode cannot satisfy: is anything on this
page carrying `data-nevo-sample`. As of 11 Sep the answer across dashboard,
classes, lessons, insights and students is **no marks at all**.

### Running it

```
E2E_TEACHER_EMAIL=... E2E_TEACHER_PASSWORD=... npm run e2e
```

Unset, the signed-in specs **skip** and the rest still run - a fork without the
secrets gets a green, meaningful run rather than a red one for a sign-in it was
never going to reach. CI passes them from repository secrets of the same names.

**The account:** a teacher on the E2E school (`751A1136`), assigned to
`E2E Probe Class`. Password is in CI secrets and nowhere else.

### Three traps, each of which cost real time

1. **`storageState` cannot carry this session.** The token is in localStorage,
   but the ROLE COOKIE is written by the client at sign-in and `proxy.ts` reads
   it ON THE SERVER to decide whether to serve console markup. Restore one
   without the other and the guard bounces you to the door. Sign in through the
   API, set the cookie on the context, and plant localStorage with
   `addInitScript` - not `evaluate` after navigating, or the console mounts as a
   guest and renders the fixtures you are testing for.
2. **`waitForLoadState("networkidle")` never settles** in this app. The first
   version used it and timed out; the failure looked like a fixture bug and was
   not one. Wait for a real element instead.
3. **ONE ACCOUNT MEANS SERIAL, and short tests.** `SessionResponse` carries
   `replaced_session`: a second sign-in as the same user kills the first. Under
   `fullyParallel`, a sibling test's login killed this one's session mid-walk.
   The file is `mode: "serial"`, and the five-page sweep is five short tests
   that each sign in fresh rather than one long one holding a session across
   five navigations.

### What it does NOT cover yet

No write path is exercised - no assign, no upload, no cancel. The E2E class
holds **no students**, because `POST /api/v1/students` and
`PATCH /students/{id}/class` both return 500 (raised). An empty tenant is
actually the sharpest setting for the fixture assertion, but it means the roster,
profile and assign flows have nothing real to act on.

---

## Coordination — read this first

Three sessions build in this SAME worktree in parallel: **student**, **admin**, and
**teacher + cross-cutting**. One `.git`, one `package.json`, one lockfile.

**THIS FILE IS HOW THE SESSIONS TALK TO EACH OTHER.** Agreed 6 Sep and in force from
now on. A chat message reaches one session and dies when its context compacts; a note
here survives, and every session already reads the repo. So:

- Found something that belongs to another console? **Write it under Handoffs** rather
  than fixing it in their files or mentioning it only in chat.
- About to do something the others would trip over — a dependency, a shared-file
  change, a rename? **Say so here before you push.**
- Starting work? **Read this file first.** It is the current state of all three
  consoles, and it is kept accurate deliberately.
- Finished something another session was waiting on? **Move it out of Handoffs** so
  nobody does it twice.

Re-read before you edit: two other sessions may have written to it since you last
looked.

### The shared lockfile

`package.json` and `package-lock.json` are the worst files to conflict on, because
resolving them by hand produces a tree that installs differently from everyone
else's. So:

- **Announce any dependency change before pushing it**, and keep it to ONE commit on
  its own branch. Do not fold a dependency into a feature commit.
- **After someone lands one: `git pull`, then `npm ci` — not `npm install`.** `npm ci`
  installs exactly what the lockfile says. `npm install` may rewrite it and start the
  fight again.
- **STOP YOUR DEV SERVER FIRST.** `npm ci` deletes `node_modules` wholesale, and Windows
  locks a native `.node` addon for the lifetime of the process that loaded it. With a dev
  server up, the delete fails PART WAY: the tree is left broken for every session, and a
  retry cannot repair it either. This happened on 6 Sep — `npm ci` after the vitest commit
  died on `EPERM … unlink lightningcss.win32-x64-msvc.node` with six Next dev workers
  alive, taking `next` and `vitest` with it until those were killed and `npm ci` re-run.
  **If you see `EPERM` on a `.node` file, that is what it means — find the process, do not
  retry.**
- **If you do hit a lockfile conflict, take the incoming file wholesale** and re-run
  the install. Never hand-merge a lockfile.

**DONE 6 Sep — pull and run `npm ci`.** The test dependencies landed in one commit:
`vitest`, `jsdom`, `@testing-library/react`, `@testing-library/dom`,
`@testing-library/jest-dom`, `@vitejs/plugin-react`. `@types/node` moved `^20 -> ^22`
because vitest 5 requires it and the runtime here is already Node 22 — the types were
older than the thing they described. The whole project still typechecks.

No further dependency change is planned by any session.

### The shared `nevo.role` cookie — new consequence as of 7 Sep

All three consoles are served from the same origin in development, so there is
**one `nevo.role` cookie between them**. Signing in as an admin in one tab makes
every tab in that browser an admin, including the ones you left on a student or
teacher screen.

That was merely confusing until #265. Now `/student/*` is guarded too, so it
BITES: with `nevo.role=senco_admin`, `/student/dashboard` redirects to
`/auth/login`, and it looks like the student app is broken rather than that you
are signed in as somebody else. The same is already true in the other direction
for `/teacher/*` and `/admin/*`.

If a console bounces you to a door you did not expect, read the cookie before
debugging the guard:

```js
document.cookie
  .split(";")
  .map((s) => s.trim())
  .find((c) => c.startsWith("nevo.role="));
```

Two browsers, or one profile per console, avoids it entirely. Worth knowing that
`useDisplayName` prefers the device-remembered name, so a signed-OUT student
screen can still greet you by name — the greeting is not evidence of a session.

### The backend proxy now has two timeouts, and a 504 — changed 8 Sep

`src/app/api/backend/[...path]/route.ts` is shared by all three consoles, so this
affects everyone. It used to abort **every** upstream call at 60s and report the abort
as `502 "The backend is unreachable right now."`

That is what made lesson regeneration look broken. Three attempts — as a student, as a
SENCo admin, as a teacher — all "failed" at exactly 60 seconds, and it was read as the
backend being down. It was our own clock. **The backend was never the thing that
failed, and this nearly went to Teslim as his bug.**

Two things changed (PR #291):

- **Generation routes get 240s**, the rest keep 60s: `api/content/parse`,
  `api/content/upload`, `api/content/lessons/{id}/regenerate`, `api/v1/uploads`,
  `.../uploads/batch`, `.../uploads/{id}/retry-pages`. **If you add an upstream route
  that generates or parses rather than reads, add it to `LONG_RUNNING`** — otherwise it
  gets the read budget and you will debug the wrong end.
- **A timeout is now `504`**, with the budget named in `detail`; `502` is kept for
  genuine unreachability. If you have error handling that assumes 502 means "backend
  down", it now also needs to expect 504 meaning "backend still working, we stopped
  waiting". Nothing branched on the old string when this landed (`TeacherPasswordReset`
  and `FeedbackPanel` both match on `err.status === 0`), so nothing needed changing —
  but check yours if you add any.

**ANSWERED 9 Sep, and it is now genuinely the backend's.** Retried as a teacher through
the fixed proxy: the call ran the **full 240s** and returned `504 "The backend did not
answer within 240s."` (283s client-side). Re-reading the lesson afterwards gives exactly
what it gave before — 2 segments, `bodyChars: [111, 111]`, 0 checkpoints, 0 variants,
`["text","visual"]` with a null `visualVariant`. Four minutes, nothing persisted.

The backend is healthy throughout: in the same window, same proxy, same token,
`GET /api/content/lessons/{id}` answered `200` in 4.9s and `/api/v1/teachers/me/home`
`200` in 6.6s. This is specific to `regenerate`.

Written up for Teslim (**not yet sent** — it is with Olayinka to forward), with three
questions: does it complete server-side; how
is a client meant to observe completion (the operation declares only `200`/`422`, no
`202`, yet `ContentParseStatus` has `pending`/`processing` and **nothing in the spec
accepts the `parseRunId` it returns**); and does it need the original source document,
since this lesson may have been seeded directly rather than parsed from an upload.

**Do not plan student content work around regeneration until that comes back.** The
after-lesson chain, four of five modalities, every checkpoint and the spaced-retrieval
loop are all built and all inert for one reason: the library is one 2-segment lesson.

### Before you push to main, check what you are actually pushing

One `.git`, three sessions, one working tree — so **your local `main` can contain
another session's commits**, and `git log -1` after a pull shows THEIR HEAD, not
what is on the remote.

This bit on 8 Sep. A doc commit was ready, `git pull` reported success, and
`git log -1` looked right — but the branch carried two unpushed commits from the
parent-portal session. Pushing would have merged their unreviewed branch into
`main` on their behalf. A rejected push was the only thing that surfaced it.

**So, every time, before pushing to `main`:**

```
git fetch origin
git log --oneline origin/main..HEAD
```

If that lists anything you did not write, stop. Do not `git pull --rebase` and
push — that publishes their work too. Instead:

```
git checkout -b <your-branch> origin/main
git cherry-pick <your commit>
```

**And check the file, not just the commits.** The same incident had a second
half: their commit also rewrote a section of THIS file, so the cherry-pick
conflicted and taking "mine" wholesale would have published their doc changes
along with it. Resolve a shared-file conflict hunk by hunk — keep yours, leave
theirs for them to land.

None of this loses work: their commits were already on their own pushed branch.
The risk is not deletion, it is publishing something on someone else's behalf
before they are ready.

### Whose files are whose

| area                                                               | owner                       |
| ------------------------------------------------------------------ | --------------------------- |
| `src/components/student/**`, `src/app/student/**`                  | student session             |
| `src/components/admin/**`, `src/app/admin/**`                      | admin session               |
| `src/components/teacher/**`, `src/app/teacher/**`                  | teacher session             |
| `src/lib/api/**`, `src/hooks/**`, `src/proxy.ts`, `scripts/**`, CI | **shared — collision zone** |

In the shared zone, run `git log -1 -- <file>` before editing to see who last moved
it, and keep the diff minimal. Stage with explicit paths — never `git add -A`, which
sweeps up whatever another session has in flight.

### THE ADMIN LANE HAS A SIGNED-IN E2E SUITE NOW — landed 16 Sep, #412.

**`fix/wire-catchup` is merged and gone.** The session that wrote it stopped, so
it was brought up from 33 behind `main` (clean, no conflicts, no dependency
change) and landed rather than handed back. The worktree `nevo-2.0-admin` is
detached and free.

**`e2e/admin-signed-in.spec.ts` is on `main` — 224 lines.** Before this the admin
console had no signed-in end-to-end test at all; `e2e/` held four specs and none
signed in as an admin. **This is what makes the rest of this console's guarantees
checkable**, the `data-nevo-sample` assertion above all — the difference between
"the suite is green" and "the suite is green while a real admin is shown invented
data".

It reads `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` and **SKIPS when they are
unset**, so a plain `npm run e2e` stays signed-out and read-only. `.env.example`
documents the variables with empty values. The seeded tenant is school code
`NEVO-E2E`, whose admin holds all seven scopes.

Also landed: `a consent object is never absent` — `StudentsView`,
`StudentDetailView`, `ndpaClaims` and `lib/api/students.ts` stop describing a
state the contract cannot produce, since `consent` is required on both
`StudentSummaryResponse` and `StudentDetailResponse`.

**The lesson this section was written for still stands.** The branch sat
unpushed in a worktree for most of a day, which made "write an admin E2E spec"
look like open work when it was finished — a branch nobody can see is
indistinguishable from work nobody has done, and the answer to "what is left?" is
wrong either way. It is the same failure as a stale blocker, one day earlier in
its life. **Push early, even unfinished, or say here that you are holding it.**
`git worktree list` shows who is where; `git log --oneline origin/main..<branch>`
shows what they have that you do not.

### Handoffs currently waiting

**For the student session — ALL FIVE ARE DONE, 7 Sep.** Left here as a record of
what closed, because two of them were wrong about _why_ they mattered:

- ~~`fromContent.ts` chokepoint~~ — **#253**. The seam was one file up from where
  this said: the variants were typed on 3 Sep but only on `content.ts`'s PARSE
  response, whose sole consumer is the teacher upload wizard. The player reads
  `LessonSegment` in `lessons.ts`, which declared none of them, so the bytes
  arrived and the TYPE erased them.
- ~~`/student` 404s~~ — **#255**.
- ~~`/student/*` unguarded~~ — **#265**. Not for the reason assumed; see the
  trap below.
- ~~`intelligence/adapt` may be the student-facing plan~~ — **#260 / #262**. It is.
  Bearer with no role restriction; a student's own token returns 200, checked
  against the deployed API.
- ~~`messagesApi.reply` unused~~ — **#250**.

**Still open for the student session:** wrap the student lane's fixture
fallbacks in `<SampleRegion>`. **PARTLY DONE — nine surfaces wrapped and each wrap
verified real, but the lane is NOT closed.** The notification bell and the
onboarding class list are both unmarked, and the bell is mis-gated on top of it —
a signed-in child gets an invented unread dot on the first frame of every page.
See the retraction under ACTION NEEDED above for the sites and the reason the
grep everyone used could not find them.

### FOR THE TEACHER SESSION — Insights is half-unblocked. 21 Sep.

**Read the caveat before you build it.** The Insights row has been filed since
16 Sep as *"design ruled and the ruling cannot be built on the current
contract"*. Half of it can now.

**What landed (20 Sep).** `ClassInsightsNarrativeResponse.state`, a new
`ClassInsightState` enum: `summary | settled | gathering`. Backend's own schema
description names the defect it fixes — *"The console was deciding this itself
from the length of three arrays, which put a threshold in the client and could
not tell a settled week"*. That is the ruling's first half: **the engine owns
the threshold.**

**It is OPTIONAL, not required.** `state` carries `default: "summary"` and is
absent from the `required` list. So an older backend build can omit it, and
absence must be treated as *unknown* rather than silently as "summary" — which
would reintroduce a client-side assumption in the one place the ruling was
about. Rule 5 applies: absence is an instruction.

**What did NOT land.** `weeklySummary` and `lookingAhead` are still **required,
non-nullable `string`**, unchanged since 17 Sep. The ruling wanted them nullable
with absence meaning "render the empty state". So the engine still cannot send
nothing. Building on `state` alone gets you the threshold, not the empty state.

**It probably closes a gate finding too.** `npm run architecture` flags
`useClassInsights.ts:151` for deciding `empty` from array lengths — which is
exactly what `state` replaces. Wire one, check the other.

#### THE CLAUSE 8.2 CAVEAT — do not skip this

**Unblocking Insights means rendering more backend-authored prose about a class,
and generated prose is live with counsel right now.** SCRUM-164 (SC-03) states
that the export-annotations question *"bears on the clause 8.2 question now with
counsel"*, and the principle it turns on is attribution: *"A parent reading the
document should never be unsure which words are Nevo's and which are the
school's. Neither should a regulator."*

**I have not seen the text of clause 8.2** — it is in counsel's draft, not this
repo; our own DPA placeholder stops at "clause 8". So this is a flag, not a
ruling.

What it means practically: `weeklySummary` and `lookingAhead` are Nevo-authored
sentences about a class that a teacher may quote to a parent. If 8.2 lands as an
attribution requirement, the constraint is on **how generated prose is presented
and marked**, not on whether the field exists. Build the threshold half if you
want it; **do not also invest in new surfaces that present generated prose as the
school's own voice until 8.2 is answered**, because that is the part that would
be reworked.

### FOR THE STUDENT SESSION — the signals wall clock. 17 Sep.

`npm run architecture` flags two sites and will keep flagging them:
`hooks/useSignals.ts:178` and `:188` — `new Date().toISOString()` on the
`SESSION_CONTEXT` event and on **every** event queued to the engine.

`hooks/**` is the shared collision zone rather than a lane, but this file is
yours in practice: its last three commits are all student, and every consumer is
a student surface (`LessonPlayer`, five Onboarding screens, `SsoCallback`,
`LessonContext`). Written up here by the admin session rather than taken, per the
coordination rule at the top of this section.

**WHY IT IS WORTH YOUR AFTERNOON.** Frontend §2: latency is the primary signal
for three of the four affective states, and *"there is no way for the engine to
recover precision you did not send."* Unlike a rendering bug this one corrupts
data at the source — every hour it runs on device wall clocks is an hour of
affective inference drawn from noise, firing at children who were concentrating
and missing children who were struggling. On a cohort of unsynced Android
devices that is not hypothetical.

**DO NOT CONCLUDE IT IS BLOCKED ON BACKEND. I did, and I was wrong.**
`SignalEventRequest.timestamp` is `format: date-time`, so the raw
`performance.now()` float has nowhere to go — which looks like a rule 4 / rule 10
deadlock and is not one. What the contract forbids is sending the raw monotonic
value, not *deriving* a skew-free timestamp from one.

**The fix, and the anchor already exists.** `startedAtRef` (`:95`) is a single
wall-clock reading, reset per session id and already sent as the envelope's
`startedAt`. Take a `performance.now()` reading at the same instant you set it,
then emit each event as `anchorWallClock + (performance.now() − anchorPerf)`,
serialised to ISO. **The contract does not change.** Every within-session delta
then becomes the difference of two `performance.now()` readings: monotonic,
immune to device clock skew, and immune to an NTP correction landing mid-lesson —
which the current code is not, and which would silently reorder a child's events.

**ONE QUESTION TO SETTLE FIRST, AND IT IS NOT BACKEND'S.** ISO 8601 bottoms out
at millisecond resolution; `performance.now()` offers sub-millisecond. So ask
whoever owns the engine: **does affective inference need finer than 1ms?**

- **No** → the above is the whole fix, contained in your lane, no contract change.
- **Yes** → then it IS a backend ask: a numeric monotonic field on
  `SignalEventRequest` alongside the existing `timestamp`.

My read is that 1ms is ample — tap dwell, response latency and idle periods all
live at 100ms and up — but that is a judgement about the engine's model and not
mine to make. It is a cheap question and it decides between an afternoon and a
contract change.

**The tempting wrong answer, named so nobody ships it:** `timestamp` is not in
the `required` set and `eventData` is `additionalProperties: true`, so a
monotonic value *can* be smuggled through. Don't. Backend would not read it, the
gate would go quiet, and everyone would believe it was fixed — the same
"accepts and ignores" trap the parent-objection `reason` field already set.

### FOR THE ADMIN SESSION — five items, 16 Sep. One is landed, four are yours.

Written by the admin session itself, after a status pass over its own console.
(This line used to credit "the teacher/cross-cutting session" — wrong: that
session's own lane note was stale, which is a small instance of exactly what the
rest of this file is about.) **Everything the console-wide lists called "still buildable" really is
empty** — these five are what is left that is neither built nor blocked on an
endpoint, and none of them is a screen.

**1. The sign-in door is FIXED — #405. Do not build it again.**
`AdminSignIn.tsx` mapped every 401 and 403 to "We couldn't sign you in with
those details. Check them and try again", then relabelled the primary button
"Try again". A paused administrator typing the CORRECT password was told to
check it, and handed a control that would refuse them for as long as they kept
pressing. `classifyLoginFailure` now does the work it already did for both
student doors and the teacher door, and `AdminSignIn.dom.test.tsx` pins it —
nine tests, mutation-checked against both halves of the bug.

Not taken, and it is yours as much as mine: **both staff doors paint the
password field violet on every error**, including a 500 and a paused account.
A field highlight is a weaker claim than a sentence, but it still says "this
field" when the failure is the server or the account. Same shape at
`TeacherSignIn.tsx:266`, so whoever fixes one should fix the pair.

One ruling inside it you may need to follow elsewhere: **the teacher's paused
line cannot be reused on this console.** "Your school admin can tell you more"
is a circle when said to an administrator and names nobody at all to a
proprietor. The admin line offers a colleague holding `team` first and ends on
`support@nevolearning.com`, which exists either way. The refusal carries
nothing that tells a SENCo from a sole proprietor, so it has to serve both.

**2. The getting-started checklist, two rows — costed, in the file, not done.**
`overviewGettingStarted.ts:33` carries the plan and it is small:

- SIGN-IN: add `ssoApi.status()` to the `Promise.all` `OverviewView` already
  runs, with a `.catch(() => null)` like its two neighbours. It settles only the
  "connect a provider" half; "share your school code" is unverifiable and MUST
  stay open.
- CONSENT: ticks from `studentsApi.list()` when no row is `not_sent`.

Export each index beside `STEP_WORKSPACE` when it lands. **Its own TODO still
says "settle the remaining three"** — it is two now, because the teachers row
settled and the sentence did not follow. That is the defect shape this file
keeps naming, sitting in the docblock that describes the fix.

**3. ~~Fifty `TODO(api)` markers, none re-checked since the spec moved.~~ THIS
ITEM WAS WRONG. Do not spend a day on it.**

It read: "`grep` returns 50, the 7 Sep audit found 17 of 97 stale, budget an
afternoon". Both halves are false, and I wrote it — turning somebody else's
count into a work item without measuring it, in the same document where I had
just written two paragraphs about exactly that failure.

What is actually true, checked marker by marker against the live spec on 16 Sep:

- **43 live markers, not 50.** Seven of the fifty grep hits are cross-references
  to or verbatim quotations of markers already retired — `AdminSidebar.tsx:30`
  literally reads *"DONE, and this said otherwise. It read \"TODO(api): a
  profile endpoint…\""*, and `snapshotTiles.ts:33` is *"See the TODO(api) on
  `OverviewView`."*
- **They WERE re-checked.** `d785a42 docs: all 45 TODO(api) markers re-checked,
  with verdicts` and `8eb192d docs: correct the sixteen misleading TODO(api)
  markers, and three the audit missed` are both in history. The "17 of 97" and
  "four wrong" figures I cited as an outstanding backlog are the INPUT to those
  commits.
- **38 of the 43 verify STILL_TRUE**, field by field, not by reading the comment.
- **Five are not, and only three carry work** — the rights-log read, the Overview
  roll-up's last fixture row, and the Reports cohort parameter. All three are in
  the "Still buildable" table above. **There is no hidden backlog behind these
  comments.**

Two are pure filing errors worth an hour: `StudentDetailView.tsx:54` opens with
*"TODO(api): BUILT, and this marker outlived it"* and should lose the prefix, and
`AdminTeamView.tsx:44` says the endpoint "is deployed and typed" then ends "Needs
design" — it is a `TODO(design)`.

**The lesson is not "markers rot".** It is that a COUNT is not a MEASUREMENT, and
this file keeps promoting one into the other.

**4. Your blocked list is three items, not five, and one ask has never been
sent.** `docs/api-requests-admin.md` now carries a 16 Sep addendum: what
shipped, what is still open with today's evidence, and a NEW ask for
`SsoConnectionHealthResponse.certificateExpiresAt`. A signing certificate
lapsing locks out every teacher and every child at that school on one morning,
and nothing in the contract can see it coming — it is the one predictable
lockout in the product. D17's card stays absent until that field exists.

**5. The sidebar identity block is HALF marked, and the unmarked half is the one
your frames actually render.** Found while verifying — and disproving — a claim
of mine that this console's sample-data work was finished; see the retraction
under ACTION NEEDED above. `AdminSidebar.tsx:460` wraps the fixture persona
"Mrs. Adebayo" in `SampleRegion kind="admin:sidebar-identity"`, but that block is
gated on `expanded` and the avatar disc's hardcoded `"AA"` sits at `:419`,
OUTSIDE the mark. **Below 1280px the rail collapses and the name block is not
drawn at all** — and every admin frame is drawn at 1024. So on the console's own
target viewport the entire fixture identity a viewer meets is an unmarked `"AA"`,
which the E2E's `[data-nevo-sample]` assertion cannot see. No `hydrated` gate on
that branch either, so a real signed-in admin takes it on SSR and the first client
frame. **S — one element moved inside the mark, plus the gate.**

**For any session:** `npm run contract` now fails the build when the client and the
deployed spec disagree. It runs in CI on every push and PR. If it fails on your
branch, the client is wrong about the API — read the finding before assuming the gate
is.

---

## Blockers that are DEAD — verified 6 Sep, do not plan around these

Re-verified against the deployed spec (168 paths / 182 operations / 132 consumed) by a
six-dimension audit, each claim adversarially re-checked. **The biggest risk on this
project right now is not the open gaps — it is quoting a closed one.** Fourteen recorded
blockers are dead; these are the ones most likely to be repeated:

- **The whole pre-auth student onboarding chain exists.** `POST /api/v1/auth/pin` and
  `POST /api/v1/connections/class-code` BOTH carry `security: []` in the document — they
  are explicitly unauthenticated. The recorded blocker "a child cannot store a PIN or join
  a class during onboarding" is wrong, and `TeacherJoin.tsx` still validates against a
  hard-coded `VALID_CODE` for no reason.
- **All five lesson variants are typed** (`TextVariant`, `VisualVariant`, `AudioVariant`,
  `InteractiveVariant`, `CalculationVariant`) and carried on both lesson reads. Teacher
  variant review was never blocked; PR #253 is taking the student half.
- **Message threads carry `unread` and `unreadCount`** (since 31 Aug), and a student CAN
  reply to a thread. Shipped in PR #250.
- **`availableFrom` landed on assignment 31 Aug** — SCRUM-114 is not waiting on backend.
- **Adaptive scaffolding is fully deployed**: attempt, history and state endpoints, with a
  ready-to-render `studentMessage` and a four-value intensity ladder. Zero consumers.
- **`GET /api/v1/permissions/me` returns a `navigation` array**, typed in this repo and
  then discarded by `PermissionContext`.
- **The child's own consent gate is live and wired.** The broad claim "nothing carries
  per-student consent" is wrong — what is missing is reading consent for _another_
  student, which is a narrower and different ask.
- **`docs/blocked-items-handoff.md` has been DELETED** (7 Sep). It was six weeks stale,
  every backend contract in it had since shipped, and it was the single most likely
  source of a wrong blocker quote. This file replaces it.
- **Nine Jira tickets describe work already on main.** The board is desynchronised in both
  directions — SCRUM-117 sits in Idea while the TOSSE page shipped 2 Sep.

Seventeen further items believed blocked are pure wiring against endpoints that already
exist and are already typed in `src/lib/api`.

**Two honest unknowns**, neither closed by that audit: whether the backend enforces
`PermissionScope` server-side (needs a two-account probe), and outbound email/SMS delivery
— `InvitationDeliveryStatus` reports `email_not_configured`, which means **nobody can
receive anything we send**, and that sits upstream of every invite and consent flow.

---

## The three piles

| pile              | meaning                                                      |
| ----------------- | ------------------------------------------------------------ |
| **BUILDABLE**     | The contract and the design both exist. Ours to do.          |
| **NEEDS BACKEND** | No endpoint, or an endpoint that cannot answer the question. |
| **NEEDS DESIGN**  | No frame, or a frame that contradicts another.               |

---

## Student app

### The entrance is open, and the lesson plays real content — 10/11 Sep

**A child can now get in.** That was not true two days ago, and it was the whole
problem: `SchoolCodeInput` drew four boxes behind a hardcoded `NEVO–` prefix
when real codes are `751A1136` and `BGA-4827`, so no code a school actually has
could be typed — and every entrance funnels through that screen.

Landed since: real school codes (#325, free-length, bounded from the contract),
a real class-code join (#330 — Teacher Join compared against a literal
`"MAP4KZ"` and called no API; the endpoint is `security: []`, public, and the
comment claiming otherwise was wrong), routing so a code- or invite-joined child
skips steps they have no answers for (#330), and the name prefilled when they
come back to it (#332).

**The player renders generated content.** Visual (#320) and audio (#321) are on;
`AudioSegment` used to animate a waveform over silence on a hardcoded 40-second
timer, so real playback had to come first. Checkpoints draw. The parse pipeline
is async now (#317: 202 + poll `finished`, never `status`).

**Honesty fixes, all invisible in review:** a signed-in child is never handed the
demo lesson when their own read fails (#327); Home no longer marks a real child's
dashboard as sample data (#299); SSO completes a real handshake instead of
inventing an account (#305); ScanMode no longer claims "You're in" having
contacted nothing (#330).

**Accessibility:** violet text measured 2.34:1 and carried the sentence a child
reads after getting an answer WRONG, while the correct note beside it was navy
at 8.8:1 — fixed with a text-only token, and High Contrast now covers violet at
all (#336). Segment advance destroyed focus, so keyboard and switch-access
children restarted from the top of the document every time; fixing it also reset
the scroll position, which nothing had ever done (#337).

**An adversarial sweep on 11 Sep found three things a diff cannot show** (#341,
#344, #345):

- The **baseline profiling submit is Bearer**, and the run is phase 0 while the
  account is created at phase 2. Every non-SSO child's cognitive profile 401'd
  and was purged — and on a shared tablet where the last child had not signed
  out, it SUCCEEDED against _their_ account. It is now parked and sent only once
  the session provably belongs to the child who sat it.
- **Offline progress was dropped by the button under "Your progress is saved".**
  The unsent buffer was a ref and the `online` listener lived in the same hook,
  so "Leave for now" unmounted both. Held outside the player now.
- **Every SSO child's band came from `MOCK_STUDENT`'s "Year 4"**, so a
  sixteen-year-old sat the P4-6 baseline and a seven-year-old was asked "What is
  15% of 200?". Nothing a signed-in child can read carries an age or year group,
  so the flow asks.

### Still open in the student lane

Nothing here is code we can write alone.

- **A returning child cannot get back in.** No remembered profile means a
  redirect into onboarding — a second account, new identifier, no history.
  `00 Student Login` designs only the remembered-device case. DESIGN.
- **A finished lesson ends in a bare "Done".** No assessment, summary or recap
  exists on any of the 183 paths. Nine built screens unreachable. BACKEND.
- **Interactive** is a question on the wire and tickable steps in the player —
  no honest mapping. **Calculation** needs `problem.answer`, and a ruling on
  whether `scaffoldImage` replaces the drawn bar model. DESIGN + BACKEND.
- **A paused child is told "That PIN didn't match."** `login/pin` declares only
  200/422 and no schema carries an account status. BACKEND.
- **`PinCreationScreen` prefers `authApi.setPin` when a token exists**, so a
  device with a stale token saves the PIN and silently never joins the class.
  Left alone only because another session has been mid-edit in that file.
- **`acceptJoin` stores no session**, so an invite-link child finishes onboarding
  with no token. Worth tracing what else that costs them.
- **`/student/onboarding` admits an already-signed-in child with no bounce** —
  the door the baseline misattribution came through. Closed for the baseline
  specifically; the door is still open.
- **Nothing shipped since 8 Sep has been seen in a browser.** All of the above is
  verified by tests and measurement, not by watching a child's screen.

### THE CHOKEPOINT IS OPEN. The gap is now CONTENT. — 7 Sep

`fromContent.ts` carries checkpoints through (#253) and `lessons.ts` declares the
five variants, so the wiring no longer stands in the way. What does:

```
GET /api/content/lessons  →  librarySize: 1
  Fractions Lesson 3      →  segments: 2
                             totalCheckpoints: 0
                             segmentsWithAnyVariant: 0
                             modalitiesClaimed: ["text", "visual"]
```

**The entire content library is one lesson, and it carries no checkpoint and no
variant of any kind.** `toQuickCheck` is wired and waiting for a checkpoint that
does not exist. Visual and audio map cleanly and could be written this afternoon —
against nothing to look at.

So the five pieces below are behind CONTENT as well as wiring, and that half needs
a producer, not a frontend change. **This is now the single largest gap in the
student app.**

**A live trap in that last line.** The segments CLAIM `visual` in
`availableModalities` while `visualVariant` is null. Anything that switches a
modality on from `availableModalities` alone draws an empty visual frame _today_.
`fromContent` and `lib/lessons/adaptation.ts` both gate on payload presence
instead — keep it that way.

### Typed, working, wired to nothing — BUILDABLE

Shipped 4–5 Sep as API-layer work. All have logic and no UI consumer:

| thing                                 | where                    | what it needs                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `markCheckpoint` / `toQuickCheck`     | `lib/api/checkpoints.ts` | `fromContent` to carry checkpoints; the player already draws `QuickCheckSheet`                                                                                                                                                                                                                                                                                                                                                                            |
| `markInteractive` / `mediaUrlExpired` | `lib/api/variants.ts`    | `fromContent` to read the five variants                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `contentApi.mediaUrl`                 | `lib/api/content.ts`     | a caller — `mediaUrlExpired` decides when                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `useDueReviews().playable`            | `hooks/useDueReviews.ts` | `SubjectDetail` pills to become links into `/review-session`                                                                                                                                                                                                                                                                                                                                                                                              |
| ~~`reflection` / `highlights`~~       | `lib/api/students.ts`    | **DONE #247.** `reflection` renders on both Progress screens, read per-subject from the narrowed route — the two routes' `reflection` mean different things, so the tab's would be a claim about all of a child's learning under one subject's heading. `highlights` is carried and NOT placed: it is a student-level list and the only nearby slot is the per-subject card note, so mapping it by index would be fabrication. **Needs a designed slot.** |

Neither `checkpoints.ts` nor `variants.ts` is exported from `lib/api/index.ts`.

### Stale comments that now contradict the contract

Each asserted a gap backend closed on 3 Sep. **The student ones are all corrected**
(#247, #253, #260); one teacher-lane comment is still outstanding:

- ~~`lib/lessons/fromContent.ts:16-35`~~ — corrected #253.
- ~~`hooks/useStudentProgress.ts:19-22`~~ — corrected #247.
- ~~`components/student/Progress/ProgressTab.tsx:28-31`~~ — corrected #247.
- ~~`components/student/Progress/SubjectDetail.tsx:37-40`, `:241-243`~~ — corrected #247.
- `components/teacher/Library/VariantReviewRoute.tsx:14-15` — **still open**, still
  calls the variants "free-form". Teacher lane.

Also corrected: `useStudentLesson.ts` no longer says the adaptation plan has no
student-facing endpoint, and `useStudentThreads.ts` no longer says "READ ONLY".

### Routing and auth

- ~~**`/student` 404s**~~ — **DONE #255.**
- ~~**`/student/*` is unguarded**~~ — **DONE #265, and the reason was not the
  obvious one.** A signed-out student render leaks no real data at all: every
  screen already gates live reads behind `useHasSession`/`useHydrated`, and the
  server markup was checked rather than assumed. The teacher/admin argument
  (never serve someone else's roster) does not apply here.

  What it fixes is this: `getSession()` clears itself once `expiresAt` passes, so
  no token is sent, so nothing 401s, so `handleAuthFailure` never fires and never
  sends anyone to the door. **A child returning the next morning got the full
  designed walkthrough — another child's name, another child's lessons —
  presented as their own.** The role cookie expires with the session, so its
  absence is the signal that case needs.

  `/student/onboarding/*` stays open: it is the flow that CREATES the session
  (`completeAccount` → `setSession` → first lesson). Do not guard it.

- **`/student/lessons/[lessonId]/review-session` is an orphan** — nothing links
  to it. `playable` is its entry point.

### Stubs that 404 on a real lesson — NEEDS BACKEND

- `/student/lessons/[lessonId]/review` — `getMockLesson` + `notFound()`. No
  attempts endpoint; attempts live in `sessionStorage` (`reviewStore.ts`).
- `/student/lessons/[lessonId]/summary` — same shape. `lessonFromContent` never
  sets `lesson.summary`, so a live lesson silently loses the summary screen.

### Blocked — NEEDS BACKEND

| thing                           | why                                                                                                                                                                                                                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ~~Student → teacher messaging~~ | **DONE #250.** `POST /api/messages` still has no `teacher` recipient — but `POST /messages/threads/{id}/reply` (3 Sep) is the door, and deliberately a different shape: access IS the thread, so a child may write only where they can already read and still cannot start a conversation.                                     |
| Thread unread state             | No endpoint reports it; the dot stays off.                                                                                                                                                                                                                                                                                     |
| Student SSO sign-in             | Entirely mock (`resolveMockSso`). `authApi.ssoCallback` exists and the teacher side calls it.                                                                                                                                                                                                                                  |
| Teacher-join class code         | Pre-auth join still compares a hard-coded `VALID_CODE`. **Re-check:** `connections/class-code` went public on 3 Sep, so this may now be closable.                                                                                                                                                                              |
| Per-concept assessment result   | Questions carry no concept id, so the after-lesson result can only tell _all_ from _none_.                                                                                                                                                                                                                                     |
| ~~Adaptation plan~~             | **DONE #260. The "no student-facing endpoint" claim was wrong.** `POST /api/intelligence/adapt` is Bearer with no role restriction and returns 200 to a student's own token. Per-segment `scaffolding` now drives the indicator, which previously drew 2-of-4 support dots from a hardcoded `?? "light"` on every live lesson. |
| ~~Backend-triggered breaks~~    | **DONE #262.** `in_lesson` mode at segment boundaries. `useBreakMonitor`'s TODO is answered; the client timer stays as the priming fallback. Only OBSERVED facts are sent — see the Zero-Tag note below.                                                                                                                       |
| Boredom escalation              | The tap spends the offer and asks nothing.                                                                                                                                                                                                                                                                                     |
| Downloads / offline             | Endpoints exist; the device half is a Service Worker project. Hidden from signed-in children, honestly.                                                                                                                                                                                                                        |
| Baseline Module 4 items         | No IRT service; items are authored mocks.                                                                                                                                                                                                                                                                                      |
| Ask Nevo scoping                | The console holds no student or lesson UUID to send.                                                                                                                                                                                                                                                                           |
| Narration audio                 | 4 × `TODO(audio)` — the assets do not exist. Playback is a simulated progress bar with no `<audio>` element.                                                                                                                                                                                                                   |

### Traps in the adaptation engine — do not relearn these

**The segment-type enums are different, and a pass-through 422s on 100% of real
content.** `ContentSegmentRequest.segmentType` (`ContentSegmentType`) and a
lesson's `contentType` (`LessonContentType`) share only `worked_example`,
`definition` and `summary`. Both segments of the only lesson that exists are
`explanatory_text`, which the engine rejects. Translation lives in
`lib/lessons/adaptation.ts` — use it, do not inline another.

**`calculation` has no engine equivalent.** Mapped to `worked_example` as the
nearest honest neighbour, not a translation. **Question for backend.**

**Density does NOT map.** The engine's `DensityLevel` (low/medium/high) is how
dense the content should be; the player's `Density` (simplify/expand/slower) is
which authored RESHAPE to show. Parsed content has one body and no reshapes.
Carrying one into the other asks the player to render a variant that does not
exist.

**Zero-Tag applies to what we SEND, not only what we render.**
`RuntimeSignalsRequest` accepts `engagementScore`, `comprehensionScore`,
`consecutiveErrors`, `accuracyBelowBaseline` and more. None are sent: nothing
defines engagement client-side, there is no baseline, and comprehension needs
marked checkpoints that no lesson carries. Measured against the live engine —
observable facts alone (`continuousMinutes: 25`) earn `mild` / `movement` /
`["time_threshold"]`; adding invented scores escalates to `high` / `full`. A
child would get a longer break on the strength of a number we made up.

**`modality_suggestion` returned `null` under every combination tried,** including
deliberately extreme ones. Nothing is wired to it. **Question for backend: what
triggers it?**

### NEEDS DESIGN

- **`InteractiveVariant` does not map to `InteractiveContent`.** The wire is a
  QUESTION (`prompt`, `options`, `answerKey`); the player's is tickable STEPS
  with an outcome. Two different things sharing a name — a design decision, not
  wiring.
- **`CalculationVariant` is partial** — `CalculationSegment` needs `scaffold`
  (kind/parts/rows) and `problem.answer`; the wire carries neither. Note
  `CalculationVariant` and `CalculationStep` exist in BOTH `types/lesson.ts` and
  `api/variants.ts` with different meanings — alias on import.
- **`highlights` has no slot.** Backend-authored and required; carried by
  `useStudentProgress` and rendered nowhere.
- After-lesson "nothing landed" heading — ours, built from the frame's own
  wording. Needs sign-off.
- Forgot-PIN — `POST /api/v1/auth/pin/reset` exists and is deliberately not
  called; the frame draws the screen as informational.
- Home encouragement line — the designed copy claims something about the child
  that nothing verifies.
- Consent gate holding state — the gate never blocks.

---

## Teacher console — SUPERSEDED, see the inventory

**The per-screen record for this console moved to
[`docs/CONSOLE_INVENTORY.md`](./CONSOLE_INVENTORY.md) and the narrative that used to sit here
has been pruned (16 Sep) because it was actively misleading**, not merely old. It was written
5-7 Sep and every list in it had rotted in the same direction: it named as blocked a set of
things that had since shipped.

Kept as a record of HOW it rotted, because the pattern repeats:

- Its NEEDS BACKEND table listed seven blocked screens. **Five of those seven are now
  delivered and built** — teacher-to-SENCo escalation, profile photo upload, the per-student
  session read, a note on an assignment, and teacher-initiated SSO all landed on 15 Sep. Two
  of the seven were never true as stated: "Recommend a lesson" was blocked on a POST that was
  not needed (`assignmentsApi.create` was reused), and variant review renders off the lesson
  read.
- Its NEEDS DESIGN list said "Specific students in the assign wizard has no frame; the wizard
  errors". It was built on 15 Sep on ids the wizard already held.
- The 5 Sep "Done" list is still true and is now unremarkable.

**The generalisable bit: a section dated by when it was WRITTEN, holding claims about what is
blocked, decays into a list of work people think they cannot start.** The inventory carries a
commit SHA rather than a date for this reason, and every blocker in it is re-tested against
the deployed spec before it is written down. Do not restore a per-screen list here.

The one part of that section worth keeping is below, because it is addressed to the admin
session rather than the teacher one and its facts were re-checked when it was written.

---

## Per-student consent — UNBLOCKED 7 Sep. FOR THE ADMIN SESSION.

**This was in NEEDS BACKEND and is now buildable.** The old entry said "no GET returns
consent for any student but the child themselves". That is no longer true. `consent` is
a **required** field on three responses plus the invite list:

| endpoint                                  | field                              |
| ----------------------------------------- | ---------------------------------- |
| `GET /api/v1/students`                    | `StudentSummaryResponse.consent`   |
| `GET /api/v1/students/{student_id}`       | `StudentDetailResponse.consent`    |
| `GET /api/v1/classes/{class_id}/students` | `ClassStudentResponse.consent`     |
| `GET /api/v1/invites`                     | `InvitationResponse.consentStatus` |

`StudentConsentSummary` carries `status` (the four values above), `actorName`,
`timestamp` and `channel` — who recorded it, when, and how. D07b's card was drawn for
exactly this; nothing needs deriving.

**The seam is already landed** — `StudentConsentSummary` is typed in
`lib/api/students.ts` and hung on `AdminStudentRow` and `AdminStudentDetail`, both
required, matching the spec. The stale comments saying consent "cannot be built" are
corrected. What remains is rendering: **D07's column, count and row action, D07b's
consent card, and the D5b roster pill.**

One caution carried over: **do not derive consent from the student's `status` field.**
An account being active is a different fact from a parent having agreed.

---

## The contract gate now checks RESPONSE SHAPES — 10 Sep

`npm run contract` compared paths and request bodies. It never compared what an
endpoint ANSWERS with, which is the half that had already broken the console
twice. **Check 3 closes it, and it found three live drifts on its first run.**

Self-tested: reintroduce the flat `Subscription` and the gate names the exact
fields and exits 1; restore it and it exits 0.

**1. `RosterSyncHistory` was snake_case; the endpoint answers camelCase.**
`{windowDays, successfulRuns, failedRuns, runs}`, all required. The client had
`window_days`, `successful_runs`, `failed_runs` — so every one read `undefined`,
and `SsoView`'s `(history?.failed_runs ?? 0) > 0` coalesced to 0 and fell into
the **HEALTHY** branch.

So **the defect PR #269 existed to fix was still live afterwards.** #269 fixed
the failed-READ path; the field names were wrong on the successful path all
along. The tests in #293 passed because the fixtures were copied from the client
interface rather than the spec — a fixture copied from the type under test can
only prove the code agrees with itself.

**2. `POST /admin/sso/roster-sync` returns 202 `{runId, status, pollUrl}`.** The
client typed it as a finished result with counts, so "Sync now" rendered
**"Synced. undefined students and undefined staff imported."** The sync went
asynchronous on the backend and the frontend never absorbed it — which is also
why `GET /admin/sso/roster-sync/{run_id}` sat unconsumed: it is the poll target.
The screen now says a sync has started and claims no numbers it does not have;
`ssoApi.runDetail` is typed and waiting for the poll to be built.

**3. `PUT /notification-preferences` answers `{preferences, savedCount,
rejected}`,** not the rows back. Latent — nothing consumes the return — but a
caller that started to would have read `undefined`.

**What the check gates on, and what it deliberately does not.** It fails the
build on ONE thing: a property the client DECLARES that the response does not
have. That is drift with no innocent reading — the field is `undefined` at
runtime and the code believes otherwise. The converse, a response field the
interface omits, is NOT an error: a screen may read a subset, and check 2
already lists fields nothing reads. Being strict there would produce the false
positives this file's own header warns get a gate switched off.

**Known limits, so nobody over-trusts it:** it compares TOP-LEVEL response types
only — a wrong shape nested inside (`RosterSyncRun` inside `history.runs`) is
invisible to it. It skips unions, intersections, inline object literals and
generics rather than guessing. It reads any 2xx, not just 200/201, which is what
caught the 202 above.

---

## All 45 TODO(api) markers re-checked, 10 Sep

Every marker in the admin console was written against an older spec and none had
been re-checked. **45 markers, judged against one pinned copy of the deployed
document** (2.0.0, 183 paths, 335 schemas) so every verdict is comparable:

|                            |                                       |
| -------------------------- | ------------------------------------- |
| **20 actively misleading** | assert something the spec contradicts |
| 4 stale                    | true-ish, wrong details               |
| 21 accurate                | leave them alone                      |

**The pattern is not 45 independent drifts.** Roughly a third fall to ONE
BACKEND DEPLOY, 7 Sep, when consent became a first-class field on
`StudentSummaryResponse`, `StudentDetailResponse`, `ClassStudentResponse` and
`InvitationResponse`, the school narrative landed, and DPA acceptance became a
typed record. Renaming accounts for only three. So the markers did not rot
individually — they were invalidated in batches, which is the argument for
re-checking them in batches rather than one at a time when a marker is touched.

**The worst one is not a `TODO(api)` at all.** `BandStep`'s docblock cited the
deployed billing API as the tie-break for shipping enrolment bands: "`GET
/api/billing/subscription` returns `subscriptionTier` and `studentCountBand`...
Two of three say bands, and one of those two is the backend, so bands ship."
Neither field exists on `SubscriptionResponse`, and `PricingResponse` carries
`pricingModel` as a const `"per_student"` — so the backend is a vote AGAINST
bands, not for them. **Bands still ship** (SCRUM-39 asks for them and they are
built), but on one source rather than two, and the D11-vs-SCRUM-98 question that
docblock claimed to settle is still open.

**A real defect fell out of it.** `ClassStudentResponse.consent` is REQUIRED and
the client's `ClassStudent` interface did not declare it — so every class roster
read carried consent for every child and discarded it, while `ClassDetailView`'s
own marker called the missing consent column "the single biggest gap" on that
screen. Declared and rendered now, with the same `ConsentPill` the roster uses.

Note the response-shape check **cannot** catch that direction: it gates on
properties the CLIENT declares that the response lacks, deliberately, because a
screen may read a subset. A required field the client ignores only reaches
check 2's advisory list when NOTHING in the client names it — and `consent` is
named all over the students lane.

**All twenty corrected in place**, each stating what it used to say and what the
document holds rather than quietly changing its mind. Four landed with the audit
(`AdminSidebar`, `JoinLanding`, `ClassesView`, `StudentDetailView`) alongside
`BandStep` and the two Settings docblocks; the remaining sixteen landed 11 Sep.

_(The PR that closed the first four said "fourteen remain". The real number was
sixteen — that count was taken before `BandStep` was reclassified. Corrected
here rather than left to be rediscovered.)_

## The three things the audit itself got wrong, 11 Sep

Correcting the sixteen meant re-verifying each against the pinned spec first,
and that surfaced three problems with the audit, not just with the markers.

**1. It missed a sibling.** `ClassDetailView`'s SECOND marker said an assignment
history "No endpoint returns it" — the identical claim to the one being
corrected on `TeacherDetailView`, in a file the audit had already opened.
`AssignedTeacherResponse` carries `role` and `assigned_at`, both required, and
`ClassDetailView` already holds them in `teachers`. Three of SCRUM-40's five
fields are on a call the screen makes; what is missing is WHO CHANGED IT and
ENDED assignments. Corrected. The lesson is the one already in the recurring-
defect list: when a marker is wrong, grep for the same sentence elsewhere.

**2. It never swept `src/lib/api/**`.** The audit covered
`src/components/admin/**` and reported "every marker in the admin console",
which read as complete. Eight API-client files carrying `TODO(api)` were never
examined — and those files are where contract claims are densest. Sweeping them
by hand found two more:

- `school.ts` had **two docblocks stacked on the same function saying opposite
  things**: "the schema declares a 201 with NO PROPERTIES" sitting directly
  above "IT RETURNS A BODY, and this was typed `void`". A correction was written
  and the thing it corrected was never deleted. Merged, keeping the one claim
  that survives (still no session on the 201).
- `sso.ts:114` asked backend to "poll the run and report the real counts" two
  lines below its own paragraph naming the poll route and its client wrapper.

The other six check out: `invites.ts` (no delivery field on `InvitationRequest`
— true), `students.ts` (`StudentMove` is `{classId}` only — true), `billing.ts`
(`vatRate` is a bare `string` with a numeric pattern and no example, so
percent-vs-fraction really is unresolved — true), `team.ts` (a question, not a
claim), and `askNevo.ts`/`signals.ts`, which belong to the student lane and are
left to it.

**3. A NEW defect shape, which the audit's categories had no name for.** Several
markers were not stale at all — they were **addressed to the wrong party**.
`TODO(api)` on work that needs no backend: SsoView's sync log (the structured
`issues[]` is already on the response), sso.ts's polling loop, the class filter
on AdaptationLogView (`classId` is already a declared query param). A marker
tagged `TODO(api)` is invisible as client work; it reads as blocked. These are
retagged `TODO (client, not api)` so the distinction survives a grep.

## The buildable-today list, worked through — 11 Sep

Nine items, each planned against the pinned spec and then handed to a second
agent told to REFUTE it. **Six survived and are built. Three were refuted**, and
two of those refutations found things that mattered more than the item.

### Built

|                               |                                                                                                                                                                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adaptation log class filter   | `classId` was a declared query param all along. Omitted rather than blanked (it is a uuid; `""` is a 422), resets the growing-limit pagination, names the class in the count, and the class list owns its own failure. |
| Getting-started TEACHERS tick | From `counts.teachers`, already in state. `SchoolRosterCounts` has NO `required` array, so `teachersOnRoster` tests `typeof === "number"` rather than `?? 0` — an absent count is unknown and leaves the row open.     |
| SSO "View technical details"  | `RosterSyncRunResponse.issues[]` was typed `unknown[]` and discarded. Now `RosterSyncIssue[]`, rendered per row. `RosterSyncStatus` also gained `running`, which the union had been missing.                           |
| Two NDPA rows                 | Consent coverage and the retention position now carry real figures under a new `school` verification. Any row that came back without a consent record sends the whole claim back to `unverified`.                      |
| Learner engagement patterns   | The five `observations` patterns phrased once, in `lib/constants/observations.ts`, with the Zero-Tag reasoning per pattern and a test that fails on trait vocabulary.                                                  |
| Assignment dates              | On the ROWS, with no history section — see below.                                                                                                                                                                      |

### Refuted, and why that was worth more than the item

**The invite consent line.** The refuter found the planned `not_sent` copy would
promise an action the product cannot perform — nothing creates a `ParentLink`
from an invite's `parentContact`, so "you can send one from their record" is a
promise D07 then denies. Chasing that turned up something much larger, below.

**The Overview roll-up.** `GET /api/intelligence/flags` returns a BARE ARRAY
capped at `limit` (default 50, max 200) with the real total in `X-Total-Count` —
a header the client's `buildUrl`/`api.get` path never exposes. Worse, that
header counts FLAGS while the row's copy claims STUDENTS, and they differ
whenever one child has two. Not built.

**The SENCo list figures.** My own marker correction called "adaptations this
week" _one windowed call_. It is not: `limit` maxes at 100, and
`AdaptationEventLogResponse.total` carries **no description in the spec**, so it
is not known to be window-scoped or uncapped. A completeness gate resting on it
could silently under-report every per-learner tally — the exact failure the item
named as the thing to get right. The only exhaustion signal the contract
actually supports is `events.length < limit`. Not built.

### The defect that came out of it, which is bigger than the list

**NEVO IS NOT THE CONSENT GATE, AND THE ADMIN CONSOLE SAID IT WAS.**

SCRUM-80 (7 Sep) ruled that the school warrants consent through the DSA, so
`not_sent` and `pending` are the school's administrative task and the child
proceeds; only a WITHDRAWAL stops processing. `lib/api/consents.ts` has encoded
that ruling since, naming `processingWithdrawn` "the only consent question the
frontend is entitled to act on". The deployed contract agrees — `ConsentGateResponse`
carries `granted` and `blocked` as two separate required booleans.

The admin console answered the wrong one in **eight places**, including
`blockedByConsent()`, whose count fed D07's header and whose name encoded the
error. A school that had asked every parent and heard back from none was told
its entire roster could not begin lessons. `StudentDetailView` said it about a
named child.

Fixed across all eight. The count survives — "who have we not recorded consent
for" is a real question a school must answer for its own DSA — but it is now
`withoutRecordedConsent`, paired with a separate `withdrawnCount`, and every
sentence describes the SCHOOL'S RECORD rather than a consequence for the learner.

**This is the fourth instance of the same shape** and the most consequential:
the console asserting something the API never said. The previous three were
markers; this one was shipping copy about a legal position, on children.

### The cross-lane consent sweep — 11 Sep

After fixing the admin console's eight sites, I swept every lane, because a fix
applied in one place and not its neighbour is how this pattern keeps recurring.

| lane           | verdict                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Student**    | Already correct. `LearningNotice` was explicitly de-gated for SCRUM-80 by that session — "WAS `ConsentGate`, AND IS NO LONGER A GATE" — and the `consent-gate` call was removed.     |
| **Parent**     | Withdrawal copy in `ParentDataManagement` is CORRECT and was left alone: withdrawal is the one state that genuinely stops processing.                                                |
| **Teacher**    | No consent-gating copy at all.                                                                                                                                                       |
| **Shared lib** | `lib/api/students.ts` carried the seed framing — 'D7 exists to answer "which students cannot yet begin lessons"'. Corrected; that sentence is where the eight admin sites came from. |
| **Admin**      | The offender. Eight sites, fixed.                                                                                                                                                    |

**Two things found that are NOT mine to fix, both flagged in place:**

**1. DPA clause 5 contradicts SCRUM-80, and the school formally accepts it.**
`lib/mocks/dpa.ts` warrants that Nevo "will not activate a learner whose consent
has not been confirmed". SCRUM-80 says the learner proceeds. This is not copy
drift: `POST /school/dpa-acceptance` records the version, the accepting
administrator and the timestamp, and D22 then cites that acceptance as evidence
— so it is a contractual term that may not describe the product. Unlike clauses
6 and 7 it carries no `[Placeholder]` marker, so it reads as settled. **The text
is deliberately unchanged** — silently rewording a term a school has already
accepted would be the worse error. Either the clause changes or the product
gates, and that is counsel's call. A conflict block sits above it in the file.

**2. Nothing enforces withdrawal client-side.** `processingWithdrawn` and
`myConsentGate` have no production callers anywhere — only tests. Meanwhile the
parent is told withdrawal "will immediately suspend {child}'s access". That
promise currently rests entirely on backend enforcement we have not verified;
`ConsentGateResponse.blocked` suggests the backend does gate, but nothing on our
side checks. Worth confirming with backend before a parent relies on it.

**Also worth a second look:** `ParentConsent.tsx` tells a parent "your consent is
all we need before she begins", which overstates their role as the gate. It is
the parent lane's copy and a defensible framing of a genuine request, so it is
left to that session rather than changed from here.

### Two questions drafted, waiting on an answer — `docs/open-questions-consent.md`

Both fall out of the consent-gate correction and neither can be settled in the
frontend:

1. **Counsel: DPA clause 5.** It warrants that Nevo "will not activate a learner
   whose consent has not been confirmed", which SCRUM-80 says the product does
   not do. The school formally accepts that document and D22 cites the
   acceptance as evidence. Either the clause is redrafted or the product gates.
2. **Backend: is withdrawal actually enforced?** `processingWithdrawn` and
   `myConsentGate` have no production callers, while the parent is told
   withdrawal "will immediately suspend" their child's access. We infer from
   `ConsentGateResponse.blocked` that the server enforces it — inferred from a
   field name, not confirmed.

### Assignment history: deliberately still not built

SCRUM-40's own words are "date, teacher, class, role, and who made the change",
its data note asks for `GET assignments/history?class_id=`, and its "done when"
requires the log to be **append-only and to show who made each change**. None of
that exists: no schema carries an actor, the DELETE returns no body, and nothing
has an `ended_at`. A collapsed second list of the same rows differing only by a
date would be a duplicate under the one heading it cannot honestly carry. So the
date sits on the row and a plain sentence states the limit. The section stays
unbuilt on purpose, not for want of an endpoint.

### Built since — 11 Sep

|                           |                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Overview roll-up rows 1-2 | Both live. Pending-consent is exact from the unpaginated `GET /api/v1/students`; open flags page `/api/intelligence/flags` at `limit=200` and terminate on a SHORT PAGE, never on a total. A partial read reports NOTHING — a count off the pages we happened to get is a floor. Counts distinct CHILDREN, not flags.                                                                |
| The sample marker         | `SampleRegion` now wraps the ONE fixture row, and the note names it ("The classes row is a sample") rather than counting, so it cannot go stale the same way. Live rows sit OUTSIDE the marker: wrapping a real roll-up in it would train the e2e suite to walk past a genuine one.                                                                                                  |
| SENCo lessons finished    | Free. The per-class fan-out moved from `studentsApi.list({classId})` to `classesApi.classStudents`, which carries `observations` at the same call count. A learner whose roster read failed, or has not answered, gets NO figure — never a zero.                                                                                                                                     |
| SENCo adaptations-this-week | Pages the seven-day log at `limit=100`, terminating on a SHORT PAGE and deduplicating by event id. `total` is not consulted at all - see the note below. A partial or failed read renders NO figures; a complete read showing nothing for a learner renders a real `0`. Mutation-verified. |
| Invitation consent state  | `consentStatus` is read now, on the invite row and in the create confirmation. Four branches, and NONE offers to send a request: nothing can, so an offer here is a promise D07 then refuses. A null state falls back to a no-claim sentence — older invitations predate the field, and "we weren't told" must not render as "nobody has been asked". Both guards mutation-verified. |

### A vacuous assertion, and how it got there — 11 Sep

One test in this batch **passed for the wrong reason** and it is worth recording
how, because the mechanism is invisible.

A `` written into a regex through a shell heredoc reached the file as a
literal **backspace byte (0x08)**. The assertion became "does this text contain
a backspace character", which is never true, so `.not.toMatch` passed
vacuously — and the line LOOKS correct in any editor that renders control
characters as nothing.

Two things caught it: the surrounding test failed first for a real reason
("consent" contains "sent", so the substring match was wrong anyway), and
`cat -A` showed `^H` where the escape should have been.

**The rule:** write test files with the editor tool, not through shell heredocs.
Every other test file in this batch was written that way and none is affected —
`grep -rl $'' src/` found exactly the one line. And prefer an assertion
that cannot be corrupted silently: this one now splits the sentence into words
and checks membership, which has no escapes in it at all.

Both guards on the new copy were then mutation-verified: reinstating the promise
the audit killed fails "never offers to send one", and making the fallback
assert contact fails two more.

## The admin design check — 74 confirmed, 15 Sep

Every built admin screen compared frame-by-frame against its frame and SCRUM
spec, each finding then adversarially verified against the code by a second
agent. **79 raw, 74 confirmed, 5 rejected.** The full register with a proposed
fix per row is `docs/design-check-findings.md`.

**Six were design-law breaches and all six are fixed.** Two of the six were
mine, both introduced in the previous 48 hours, and both against rules written
down in the files I was editing:

| | |
|---|---|
| A withdrawn parent could be asked again | Both student screens gated the action on "anything but confirmed", which includes `withdrawn`. SCRUM-40 forbids it outright — and it matters more since 15 Sep, when backend began enforcing withdrawal: the child is genuinely stopped, so the request goes to the parent who stopped them. |
| A class could go to a deactivated teacher | `RemoveAccessSheet` filtered on identity alone. `isActive()` was written and unit-tested next door and simply never called — producing the orphaned class the sheet exists to prevent. |
| Zero-Tag, learner profile | Accommodations rendered as pills reading "Reading", "Attention", "Numerical" beside a named child. A category noun next to a learner's name is a label about that learner however neutral the word looks alone. |
| Zero-Tag, adaptation log | The row headline printed `simplify_trigger`. The labels had been written for the type filter **one hour earlier** and not used in the rows. |
| A card on the finance home (MINE) | Rendered brand and last four with a "Manage" route. SCRUM-98 and D11 forbid it in every state, and `PaymentMethod` is annotated **"Read, never rendered"** on the very type it was read from. |
| The bulk-import lesson claim (MINE) | The `skipped > 0` branch was corrected and its sibling three lines below was not. |

**The pattern, and it is the one already named in this file:** four of the six
are a rule stated in a comment while the code a few lines away breaks it, or a
fix applied to one branch and not its neighbour. Docblocks are not a control.

**The remaining 68** are 39 states the frames draw that do not exist, 19 layout
divergences (many at 1024x768, which is the breakpoint that gets forgotten), and
14 copy differences. None is a correctness or safety defect. They are the
backlog of "built to the frame, not quite" — worth working through before the
design review, and now enumerated rather than guessed at.

### Still buildable, not built — ELEVEN found, FIVE landed. This said NONE.

**Corrected 16 Sep.** This heading read "NONE — the list is empty, everything
remaining on the admin console is blocked on an endpoint". It was written 15 Sep,
repeated in every status answer since, and never re-derived. It does not survive
a walk of the lane.

It was also self-contradicting on its own page: the paragraph above it describes
68 remaining design-check findings as "39 states the frames draw that do not
exist, 19 layout divergences and 14 copy differences" and calls them "worth
working through". Layout and copy work is by definition not endpoint-blocked.
Those 74 are genuinely closed now — so the list below is what turned up OUTSIDE
that register.

| # | what | where | size |
|---|---|---|---|
| 1 | **DONE #420.** **Nothing in the product can reset a student PIN.** `POST /api/v1/students/{student_id}/pin/reset` is deployed and tagged "school administration" — the same tag as `deactivate` and `restore`, which this console does consume. Grep returns TWO hits in all of `src/`, both docblock prose in `student/Auth/ForgotPinScreen.tsx:14,17`. **Zero callers.** The child's Forgot-PIN screen says "ask your teacher"; the teacher console has no such control and neither does D7b. `NotificationType` even carries `pin_reset_requested`, so the notification arrives with nowhere to act on it | `Students/StudentDetailView.tsx` | M |
| 2 | **v1.5 / out.** **Profile photo is shipped and entirely unconsumed.** `grep -rn profileImageUrl src/` returns **0 across 681 files**, while `CurrentUserResponse.profileImageUrl` comes back on every `GET /users/me` the console already makes, `ProfilePatch.profileImageUrl` accepts it, and `POST /users/me/profile-photo` takes the multipart upload. `lib/api/users.ts:22-33` simply does not declare the field, so it is dropped on arrival | `lib/api/users.ts:22`, `Settings/AccountSettings.tsx` | M |
| 3 | **DONE #420.** **A genuinely dead primary CTA.** "Request another account" is `<button type="button">` with no `onClick`, no handler, and no `<form>` anywhere in the file to catch it. Its own copy is "We'll add it at no charge - just ask", which needs no bespoke endpoint: `mailto:` or `feedbackApi.submit` (`feedback.ts:22`, deployed and consumed) satisfies it. Breaks this console's own law at `SettingsView.tsx:42-44` — "a settings screen that appears to save and does not is worse than one that admits the control is not built" | `Team/AdminTeamView.tsx:320` | S |
| 4 | **DONE #420.** Getting-started **CONSENT** step can never tick. `studentsApi.list()` is already called in this same component at `:271` into `roster` and used only in the non-early branch; `AdminStudentRow.consent` carries the status. The fix is prescribed verbatim at `overviewGettingStarted.ts:44` and labelled `TODO (client, not api)` | `Overview/OverviewView.tsx:633` | S |
| 5 | **DONE #420.** Getting-started **SIGN-IN** step can never tick. `overviewGettingStarted.ts:41-43` states the fix: add `ssoApi.status()` to the existing `Promise.all` with a `.catch(() => null)` like its two neighbours. Settles the "connect a provider" half only — "share your school code" stays unverifiable and MUST stay open | `Overview/OverviewView.tsx` | S |
| 6 | **DONE #420.** Sidebar fixture identity, half-marked and ungated — see the retraction under ACTION NEEDED | `Shell/AdminSidebar.tsx:419` | S |
| 7 | **v1.5 / out.** **The Compliance parental-rights claim has a source now.** `GET /api/v1/consents/rights-log` is live, paginated, filterable, and has **zero callers**; `resolvedAt === null` gives requests-in-progress. It already honours our own privacy constraint — `reasonRecorded` is a BOOLEAN, so a parent's free text never crosses the wire. Two caveats so this is not oversold: `ParentRightType` still has no `erasure` value, so this licenses a correctly-worded replacement rather than restoring the pulled text; and the op sits under the `consents` tag, so confirm admin scope first | `Compliance/ndpaClaims.ts:57` | M |
| 8 | **v1.5 / out.** **Reports cohort selector — partly unblocked, and the stated reason is false.** The docblock asserts "every read behind this screen is school-wide with no cohort parameter at all". `GET /api/transformation-metrics` takes `scope` and `cohortId`, and `lib/api/analytics.ts:89` ALREADY types it. The other two reads do check out. The design argument may survive; the stated reason must stop being cited as a backend ask | `Reports/ReportsView.tsx:86` | S |
| 9 | **v1.5 / out.** `reviewedByName` resolves client-side. `IepExportResponse` carries `reviewedByUserId`; `GET /api/v1/admin/team` is unpaged and returns names for every admin, and an IEP reviewer is an admin. Price the caveat first: that route is scope-gated, so a SENCo holding only `senco` may 403 — degrade to the date, which still beats "only ever name the reader" | `Senco/IepExporterView.tsx:512` | S |
| 10 | **v1.5 / out.** The last fixture row on the Overview roll-up. The marker says "classes haven't run a lesson is the only one with no source"; `ClassStudentResponse.latestSessionAt` is typed at `lib/api/classes.ts:102` and already read by `useClassRoster.ts:59`. This is what deleting `overviewSample.ts` outright is waiting on | `Overview/overviewSample.ts:14` | M |
| 11 | **v1.5 / out.** House copy rule, this lane's share. 25 `&ndash;`/`&mdash;` entities remain; the 14 Sep "no dashes in Nevo copy" ruling was applied to teacher and parent and skipped here | `components/admin/**` | S |

**Two documentation chores, an hour together.** `Students/StudentDetailView.tsx:54`
opens with its own words *"TODO(api): BUILT, and this marker outlived it"* — strip
the prefix so it stops being counted as a blocker. `Team/AdminTeamView.tsx:44`
states in its own text that the endpoint "is deployed and typed" and ends "Needs
design"; it is a `TODO(design)`, filed under `TODO(api)`.

**The admin signed-in E2E spec is DONE and on `main`** (#412, 16 Sep) — it was
written, then sat unpushed in a worktree for a day. Do not write another; extend
that one.

**Why this heading was wrong for a day, and how to not repeat it.** Three of the
eleven above are recorded as open in this repo's own files, including one this
very page flagged at "Also unwired: `POST /students/{id}/pin/reset`". A blocked
or completeness claim decays silently because *the thing that resolves a row
never edits the row*. `node scripts/api-audit.mjs` takes under a minute and
would have caught every one.

**`total` did not just go unused — it was actively dangerous.** The first draft
of `collectAdaptationWindow` used it as a corroborating gate: report nothing if
`total` claims more rows than we read. The tests killed it, and the reasoning is
worth keeping. If `total` counts the whole log rather than the seven-day window,
that gate disagrees on every school on every load — so the figure would be blank
everywhere, permanently and silently, for a reason nobody would ever find. A
normal concurrent write during paging tripped it too. **A field whose semantics
the contract does not document cannot be the thing that decides whether a screen
speaks.** Termination is on a short page, which is the only exhaustion signal
this contract actually supports.


### The two persona homes — built 14 Sep

D17 and D18 were the last unbuilt admin screens, and neither was blocked. Sign-in
had been routing every persona to the Overview because they did not exist — and
the Overview is gated on `oversight`, so an IT contractor or a finance
administrator met a REFUSAL as their first sight of Nevo.

`/admin` is now a chooser (`adminHomeForScopes`). It lives there rather than in
`proxy.ts` deliberately: the proxy holds only the role mirror cookie, and the
role is `senco_admin | other_admin`, which says nothing about scopes.
`PermissionProvider` already fetches them above every /admin route, so the
chooser costs no extra request. Neither home adds a rail row —
`activeNavLabel`'s longest-prefix rule lights IT & SSO and Billing already.

**Two cards on the IT home are absent, and stay absent:**

- *"2 connected · Microsoft + Google"*. `GET /admin/sso/status` returns ONE
  `SsoConnectionHealthResponse` with a single provider. One per school is what
  the data model says, so the card NAMES the provider instead of counting them.
  This is a product question, not a missing endpoint — do not file it as one.
- *"SSO signing certificate renews in 40 days"*. **TODO(api):** no certificate
  or expiry field exists anywhere in the contract; the only `expiry*` fields
  belong to payment cards. Nothing today can see a signing certificate lapse
  coming.

**Three copy corrections the frames needed:**

1. `missingTeacherClassMappings` counts TEACHERS. The frame says "3 accounts
   couldn't be matched to a class"; calling them accounts would widen a
   teacher-to-class gap into a claim about students' sign-ins.
2. `UpcomingCharge` carries a due date and **no issue date**, so the finance
   home says an invoice "is due", never that it "issues on" — a different event.
3. The finance home prints **no VAT rate**, though the frame shows "+ 7.5% VAT".
   `vatRate` is still a bare string with no example; Billing shows the amount
   for that reason and this screen agrees with Billing rather than the frame.

Also caught in review and fixed before shipping: `RosterSyncStatus` has FOUR
values and the first draft handled three, so a run the provider named
`partial_manual_review` produced no row and the hero then said nothing needed
attention. And the neutral "N imported" row was being counted in "N things worth
a glance", telling a healthy school it had something to look at.

### THE ADMIN CONSOLE IS CLOSED AT v1 — 16 Sep

**Said plainly, because without this sentence the console keeps absorbing days.**
It is the best-documented, best-specced surface in the product: 41 of 51 screens,
the 74-finding design check closed, no stubs — 22 of 23 routes render real
data-wired views and the 23rd is a deliberate scope-aware redirect. That makes
progress here *feel* productive, which is exactly the trap. **Admin is not what
stands between this product and a working one.**

**What went in on the last day:** the four highest-impact items from the eleven
above — a child locked out of Nevo can be given a new PIN (nothing in the product
could), the sidebar stopped showing real admins an invented person, the dead
"Request another account" button does something, and the last two getting-started
rows tick from what the school actually did. Plus the admin signed-in E2E suite
(#412), so these guarantees are asserted against something.

**Deliberately OUT of v1, and not because anyone ran out of time:**

- **Profile photo upload.** The capability is shipped and unconsumed, and it is
  still the weakest value-per-hour on the list: a multipart upload with preview,
  limits and failure states, for an avatar.
- **Four cosmetic or marginal items** from the eleven: the 25 `&ndash;` entities,
  `reviewedByName` via the team read, the Overview roll-up's last fixture row,
  and the Reports cohort selector.
- **Wiring `GET /consents/rights-log` into D22** (row 7). This is the one I would
  reopen the console for if there is appetite, and it is named here rather than
  left unspoken: it turns the Compliance parental-rights claim from a mechanism
  with no number into a measured figure, and the endpoint was built to our own
  privacy specification. Two reasons it is not in v1 — it needs a scope check
  first (the op sits under the `consents` tag, not `oversight`), and D22's other
  two claims stay unverifiable regardless, so the screen does not become whole.

**That accounts for all eleven: five landed, six deliberately out.** No item is
sitting in this list unspoken, which is the state that produced "NONE".
- **Twelve backend-blocked items**, moved to v1.5 below rather than left on an
  open list. *A blocked list that never shrinks stops being read as a decision
  and starts being read as weather.*

**Reopen this console for exactly four things:** a pre-launch row below landing,
a defect a real school hits, a design ruling that changes a screen, or **a
counsel ruling on the learning support surface**. Not for the deferred list.

**THE FOURTH IS NEW, 21 SEP, AND IT IS NOT HYPOTHETICAL.** The learning support
surface — accommodations, the IEP export, per-learner adaptation counts — is the
largest omission in the pack now with counsel, and SCRUM-164 records that the
export annotations question *"bears on the clause 8.2 question now with
counsel"*. If Oladayo rules against how that surface attributes or presents
material about a named child, **this console reopens**, and it reopens on its
most sensitive screens rather than its edges. Closed is a statement about
engineering, not a bet on the ruling.

**IT GOES TO COUNSEL DISCLOSED, NOT WITHDRAWN — confirmed 21 Sep, and this is
the operative instruction.** Accommodations, the IEP export and per-learner
adaptation counts **stay built and stay shipping** while Oladayo rules. Nobody
is to pre-emptively strip them the way the per-child transformation metrics
were struck: those were withdrawn by a product ruling (SCRUM-169), whereas this
is a question put to a lawyer with the surface described as it stands. Removing
it first would make the disclosure inaccurate — we would be asking him to rule
on something that no longer exists — and would cost the SENCo surface for a
ruling that may never go against us.

**Build nothing new on it, remove nothing from it, wait.** The other three
reopen triggers still apply to the rest of the console.

**One thing already checked, so nobody re-checks it in a panic.** SCRUM-169
strikes the four per-child transformation metrics and warns that *"the document
now with Oladayo Akande states that nothing in the product describes a child …
While any per-child metric renders, that statement is untrue and a lawyer is
relying on it."* **Verified 21 Sep: none of them renders anywhere.** All four
names appear in exactly one place in `src/` — a docblock at
`Reports/ReportsView.tsx:24-40` explaining why they were never built —
`getTransformationMetrics()` is called with **no arguments**, so school-wide
only and never `scope=student`, and nothing in the SENCo profile, the student
record or the IEP export references them. The statement counsel is relying on
holds. SCRUM-169 can close on the admin side.

---

---

---

---

---

---

---

## 23 September — the consent gate is real. RULING CONFIRMED · student-lane handoff

**Settled: a child whose consent is not in cannot reach the assessment at all.**
Not a lesson, not the baseline. The 7 Sep *"Nevo is not the consent gate"* ruling
is superseded.

**The screen exists and this session did not find it for a day.** The 20 Sep
drop's own commit message says *"entry-point consent gate, admin/student/teacher
screens"*, and we read only the admin frames. `student/14 Consent Gate` was
**deleted** and `student/00d Waiting on Consent` (SE-01) added in the same
commit — the gate moved from mid-flow to the entry point, which is the whole
change. **Read the commit message of a design drop, not just the files you
expected it to touch.**

### SE-01, in full

> **"Nevo isn't quite ready for you yet"**
> *"It will be soon."*

That is the entire content, and the constraints are as much the design as the
words:

- **No progress, no countdown, no refresh, no door held shut.**
- A student's link routes here **only** when consent is not in.
- When consent arrives, opening the same link goes **straight to the assessment**
  — no action from the child, nothing to press.
- Primary case is a **shared classroom tablet at 768×1024**; mobile 375×812
  second. Not a desktop screen.

It says Nevo is not ready. It does not say the child is blocked, and it never
mentions consent, a parent, or a school — which is the Zero-Tag reading: a child
is not told they are the subject of an administrative problem between adults.

### Handoff — student lane

| | |
|---|---|
| Read | `accessBlocked(gate)` in `lib/api/consents.ts` — already built, tested, no caller |
| Route | SE-01 sits at the **entry point**, before the assessment |
| Frame | `student/00d Waiting on Consent.dc.html` |
| Do not | compute the condition. `ConsentGateResponse.blocked` is the server's verdict; `processingWithdrawn` is a **different** rule and the two are deliberately independent |

`AgeCheckResponse.blocksAccess` reaches the same door by another route — a date
of birth the school and the parent disagree on also holds a child until a person
resolves it. Same screen, presumably; worth confirming rather than assuming.

### Still unbuilt on the admin side

D25 PC-03 is the roster view of this: *"Who is cleared to use Nevo, and how each
consent was given. A child stays out of lessons until they're cleared."* — with
cleared/outstanding counts and a digital-vs-written split. Nothing renders it.

### Not a counsel question after all

The DPA-before-verification finding is **build-only**: there are no real schools
yet, so no acceptance record exists that was collected from an unverified
address. It is a wizard reorder, not a remediation.


## D24 Getting to Active — audit against the onboarding wizard. 23 Sep

### First, a correction

**"We built a wizard and D24 says never a wizard" was wrong.** D24's *"Resumable,
never a wizard"* describes OB-00, the dashboard a school lives in **between
registering and paying** — a surface that does not exist at all. `OnboardingWizard`
is D01 *registration*, which is still correctly a wizard. They are sequential
phases, not competing designs. The real findings are different and are below.

### D01 went from five steps to four, and two of ours were cut

D01's own step rail, after the 20 Sep drop:

> **1** Sign up · **2** Confirm email · **3** DPA read-gate · **4** School details
> → Dashboard (OB-00)
>
> *"4 steps; the school code now lives on the dashboard overview"*

Against what is built:

| D01 now | We ship | |
|---|---|---|
| 1 Sign up | `SignUpStep` | matches |
| 2 **Confirm email** (AC-01/AC-02) | — | **missing entirely** |
| — | `AuthMethodStep` | **no longer in D01** |
| — | `BandStep` | **no longer in D01** |
| 3 DPA read-gate | `DpaStep` (step 3 of 5) | right content, wrong position |
| 4 School details | — | **missing** |
| → Dashboard (OB-00) | `HandoverStep` | replaced by landing on OB-00 |

The indicator reads "Step N of 5". Neither `AuthMethodStep` (249 lines) nor
`BandStep` (211) appears anywhere in D01 now — no mention of a sign-in method or
a band. Whether they were cut or moved is a question for design; they are not on
this flow.

### The finding with actual weight: the DPA is accepted by an unverified address

D01 states the ordering **and its reason**:

> *"Email confirm sits before the DPA so acceptance is tied to a verified owner."*

Our wizard has no email-confirmation step, so a proprietor reaches `DpaStep` and
accepts having proved nothing about the address. **The DPA acceptance record is a
compliance artefact** — it names an administrator, a version and a timestamp, and
D12/D22 both display it. Right now that record can name an address nobody has
shown they own.

This is the one item here that is not a build backlog entry. It should go in front
of counsel with the other six, because it changes what the acceptance record is
worth rather than how a screen looks.

The screens for it already exist: SCRUM-151 shipped `/auth/admin/confirm/[token]`
(#491, #503) and `emailConfirmationApi`. What is missing is the wizard **step**
and the ordering, not the machinery.

### D24 itself: six endpoints, all deployed, none called

The whole getting-to-active flow is unbuilt, and the contract supports every
screen of it:

| | |
|---|---|
| `GET /api/v1/onboarding` | **never called** — `OnboardingState`, described as *"Everything the onboarding screens render, in one read"*: `stage`, `classes`, `teacherCount`, `studentCount`, `rejected`, `invoiceId`, `amountDue`, `currency`, `periodLabel`, `canConfirm`, `canPay`, `canActivate` |
| `POST /api/v1/onboarding/imports` | **never called** — OB-01 upload |
| `PATCH /api/v1/onboarding/classes` | **never called** — OB-02 corrections; `ClassCorrection` is `{normalisedName, renameTo, drop}` |
| `POST /api/v1/onboarding/confirm` | **never called** — OB-02 "Confirm 336 students" |
| `POST /api/v1/onboarding/activate` | **never called** — OB-05 |
| `POST /api/v1/onboarding/additions/quote` | **never called** — D24b's mid-term cost quote |

`OnboardingState` is exactly the *"resumable, never a wizard"* shape: the server
owns the stage and the three `can*` booleans, so the dashboard renders what it is
told rather than deriving where a school has got to. **Nothing here needs a
threshold computed on our side.**

Billing is the half that is NOT missing — `bank-transfer-details`, `invoices`,
`subscription`, `upcoming`, `manual-transfer` are all wired. So OB-04's transfer
screen has its data; what it lacks is the screen.

### What OB-00 requires that we have nowhere

- **The console is reachable but read-only until active.** *"You can look around
  the rest of your console — Classes, Teachers, Reports, Billing. You can't make
  any changes until Brightgate is active."* That is the same shape as D01b's
  AC-05 (writes paused until the email is confirmed), which is also unbuilt.
  **Two separate reasons a console is read-only, and no read-only mode exists.**
- **Three distinct moments**, not a progress bar: nothing uploaded (an
  invitation), staff-only (a half-finished job), roster in (one question, one
  answer). Each has its own copy and its own panel.
- **The headcount panel is permanent**, not a step: *"Once a roster exists it sits
  on the dashboard permanently, so the school sees its own number every time it
  signs in."*
- **The waiting state is not a spinner.** *"A school paying by transfer may leave
  overnight and come back."* It must survive being left.
- **Never red, never nagging** — including the not-yet-matched payment state.

### Sizing, honestly

OB-00 alone is three moments plus a read-only mode across the whole console.
OB-01/02 is an upload and a derived-result screen with per-row rejections. OB-03
is a standing panel. OB-04 is two states. OB-05 is one.

That is not a day. It is the largest unbuilt thing in this console, and it is the
path every school walks before any other screen matters.


## D05 Classes — audit against what we shipped. 23 Sep

`admin/D05 Classes` changed **199 insertions / 25 deletions** in the 20 Sep drop.
It now carries OB-07: the list grouped by year group, a single Add-a-class sheet
with duplicate detection before submit, and Add-several. We shipped CL-03/CL-04
(#478) and CL-06 (#473) against the PREVIOUS version.

**Two items below are defects and are fixed. The rest are divergences, listed so
somebody can decide rather than discover.**

### FIXED — four fields arriving and being discarded

`ClassSummaryResponse` carries `section`, `academicSession`, `capacity` and
`teacherCount`. `AdminClass` declared none of them. D05's list draws
`{{ it.name }}` beside `{{ it.section }}` and its sheets offer the other three,
so the frame was rendering data our type said we did not have.

**The contract gate structurally could not see three of the four.** Check 2
reports spec fields named NOWHERE in the client — and `section`,
`academicSession` and `capacity` are all named on `ClassWrite` a few lines
below, so it stayed silent. Only `teacherCount`, mentioned nowhere, surfaced.

Third occurrence of that shape; `ClassStudent.consent` was the first and its own
comment already describes the mechanism. **A field being mentioned somewhere in
a file is not the same as being read where it arrives.**

`teacherCount` also kills the N+1 in `ClassesView`, which fetches `classTeachers`
once per row to build the teacher column.

### FIXED — a comment that had become false

`classesApi.create` said *"the deployed schema takes `{ name, yearGroup }` and
nothing else"*. `POST /api/v1/classes` now takes the full `ClassWrite`. So D05's
single sheet drawing Section, Academic session and Capacity is **buildable
today** — the sheet not offering them is ours, not a contract gap.

### NOT DONE — the list

| Frame | We ship |
|---|---|
| Grouped by year group, with `{{ it.label }}` group headers | Flat list sorted by year, with a **Year column** the frame removed |
| `{{ it.section }}` beside the name | Not rendered — the field was undeclared until this PR |
| Header: *"2026/27 session · grouped by year group"* | Absent |
| Primary button **"Add a class"** | "Create a class" |
| Empty state: **"Add a class"** + **"Create from a staff or student file"** | "Create a class" + "Import from SSO" |
| Empty copy: *"Add a class by hand, or upload your roster and Nevo builds your classes from it. Either way works — a class with no students in it yet is perfectly normal."* | The old *"Create your first class, then assign a teacher…"* |

The empty-state copy is the one worth reading rather than skimming: the new line
tells a school **an empty class is normal**, which is reassurance the old line
does not give, on the screen where a school first doubts it has done this right.

### NOT DONE — Add a class (single)

`ClassFormSheet` has no Section, Academic session or Capacity. All three are now
writable and readable. The frame's duplicate warning is also richer than ours:

> *"This matches **JSS 2A**, which already exists in **Year 8**. Rename this one,
> or open the existing class instead."*

Ours (`duplicateName.ts`) says `"JSS 2A already exists."` — it names neither the
**year group** of the collision nor the second action, **open the existing
class**. Our archived-collision variant has no frame equivalent and should stay.

### CLOSE — Add several

`BulkClassSheet` matches the frame's shape. The copy differs:

- Title: "Add several classes" → **"Add several at once"**
- Subtitle: "…We'll name them for you." → **"…the sections you run. Nevo composes the names."**
- Count: "N classes will be created" → **"…will be created in the 2026/27 session."**

That last one is not only copy. It names the session, and `academicSession` is a
real field we do not send — so the sheet creates classes with no session on
them while the frame's own line promises one.

### Not a divergence

`RejectedRows` (CL-06) has no D05 equivalent — the frame draws no rejection list
for bulk create. It is backed by `ClassRejection` in the contract and stays.


## 23 September — the frame existed and we did not look

`admin/D01b Email Confirmation & Access` landed in the design repo on **20 Sep**,
in Lydia's consent-flow drop. SCRUM-151 was built on **22 Sep** with invented
copy, under a component comment asserting *"NO DESIGN FRAME EXISTS FOR THIS
SCREEN."* The frame was two days old and one `git pull` away.

**An absent frame is a claim like any other, and it decays the same way.** The
rule that already exists in this file for blockers — re-derive before planning
around it — applies to "design has not drawn this" exactly as much. Pull the
design repo before concluding there is nothing to build to.

The state machine survived the diff unchanged, which is worth noting: that half
was built to the contract and the contract was right. It was only the words that
were invented, and words are the half a frame owns.

### Fixed (#500)

AC-03 and AC-04 now carry D01b's own sentences — the 24-hour lifetime, the
address the link went to, *"perhaps on another device, or by clicking the link
twice"*. Tests pin the frame's wording rather than a regex that would pass
against either.

### AC-03 draws two controls the contract cannot serve — RAISED, not built

The frame puts **"Send a new link"** and **"Change the email address"** on the
expired screen. `POST /admin/email-confirmation/resend` carries `HTTPBearer`,
and **nothing writes an address change at all**. Anyone arriving from an email
link is by definition not signed in, so both would 401.

Absent rather than drawn-and-broken. `TODO(api)`: a **token-authenticated**
resend — the expired token already proves which account it is, which is the
whole reason the link works as a credential on `verify`.

### AC-05 IS NOT BUILT, and it is the bigger half

> *"Confirm your email to start setting up. You can look around, but changes
> are paused until you confirm."*

A signed-in but unconfirmed admin gets a **read-only console**: Overview renders,
every write is paused with its own inline reason (*"Confirm your email first —
we sent a link to…"*, *"Paused until your email is confirmed"*), and **"Resend
it"** sits inline where it does work, because that surface is authenticated.

This is a behaviour across the console, not a screen. `emailConfirmationApi.read()`
was written in #491 and **is called by nothing** — it is exactly the read AC-05
needs. Sized as its own piece of work; not started.

### Frames NOT yet audited against what we shipped

Only D01b has been diffed. The same drop changed six others, and two of them
cover work built this week:

| | |
|---|---|
| `D05 Classes` (224 lines) | the bulk create / CSV import shipped in #473/#478 |
| `D08b Learner Profiles` (190) · `D15c SENCo Learner Metrics` (87) | changed by the transformation-metrics **ruling**, not a redesign |
| `D01 School Onboarding` (319) · `D03` · `D04` · `D07` · `D16c` · `D19` | unaudited |
| `D24 Getting to Active` (817) · `D24b` · `D25` / `D25a` · `D26` | **new, entirely unbuilt** |

`D25 Consent (Written Route)` and `D25a Consent Form (Print)` matter for the
consent work below: the written route is the answer backend gave for parents who
do not use email, and no part of it exists in `src/`.


## 23 September — the doors do not check who you are. HANDOFF, two lanes

QA found a teacher's credentials accepted at the **admin** sign-in: success
state, hold, push to an admin route, and only then `proxy.ts`'s role-cookie
guard bounces them. The guard holds and nothing leaks — but a correct password
produced what reads as a broken login.

**All three password doors have it.** Each stores `session.role as UserRole` and
never checks it:

| Door | File | Owner |
|---|---|---|
| Admin | `admin/Auth/AdminSignIn.tsx` | **FIXED, #499** |
| Teacher | `teacher/Auth/TeacherSignIn.tsx:145` | teacher lane |
| Student | `student/Auth/ReturningSignInScreen.tsx:157` | student lane |

This is the *one defect in N places* shape again. The admin one is fixed and the
other two are **not** — they are left to their owners rather than edited from
this session, because three sessions share one worktree.

### The tool is built, so each remaining fix is small

`src/lib/auth/consoleDoor.ts` holds the rule: `roleBelongsAt(door, role)`,
`doorForRole`, `knownRole`, plus `DOOR_HREF` / `DOOR_LABEL` for the copy.
`LoginFailure` has gained `"wrong_door"`.

**`roleBelongsAt` is built from the same `isAdminRole` that `proxy.ts` uses, and
that is the point.** A door that re-states the guard's rule in its own words is a
second rule that can drift from the first — and the drift shows up as refused in
one place, admitted in the other.

Only `AdminSignIn` had `Record<LoginFailure, …>` maps, so the new union member
breaks nothing in the other lanes. It will not *force* them to handle it either,
which is worth knowing: add the maps when you fix them and the compiler starts
helping.

### Three things the fix has to do, not one

1. **Check before `signIn()`,** not after. Storing then refusing still writes the
   role-mirror cookie.
2. **End the session.** The login SUCCEEDED, so one exists server-side; refusing
   without `authApi.logout()` leaves somebody told "not here" holding a live
   session for somewhere else.
3. **Name the right door and link it.** Telling somebody their own role after
   they have proved the account is theirs is not a disclosure — the leak would be
   saying it *before* the password is checked. Without the link it is a dead end,
   which is the reported bug minus the false success.

`RETRYABLE.wrong_door` is **false**: the same credentials will be just as correct
and just as wrong next time, and "Try again" sends them round the loop that
produced the report.

### Not a bug, and worth not "fixing"

QA's second item — a bounced teacher reaching `/teacher/dashboard` — is correct
behaviour. The session genuinely is a valid teacher session. It only looked wrong
because the first bug made sign-in appear to have failed.


## 22 September — four things shipped, and what is carried

**Built and merged**

| | |
|---|---|
| SSO credential expiry | #481, then **corrected by #486**. See below — the correction matters more than the build. |
| IEP shares read | #488. Pre-launch row closed. `revoked` renders as its own sentence; a failed read is held apart from an empty one. |
| SCRUM-151 confirm route | #491. `/auth/admin/confirm/[token]`, five outcomes kept apart, no resend button (see below). |
| `ParentContactMethod` | #483. Narrowed to `email`; three comments of ours had been asserting a two-member enum for a day after it dropped to one. |

### The correction worth reading: null is not health

#481 gated the IT-home warning on the server's `credentialExpiringSoon` and
rendered **nothing** when `credentialExpiresAt` was null. That was wrong, and it
was wrong in this file's favourite direction.

The expiry **cannot be read back from the provider** — it is an OAuth client
secret recorded by hand at setup, not a SAML certificate we can interrogate. So
null does not mean "fine", it means **the school never told us**, and therefore
that nothing can warn them. Rendering nothing let the hero go on saying
*"Nothing needs your attention"* to the one school we cannot protect.

**Rule 5 read backwards.** Absence is an instruction to render the state that
corresponds to nothing — not to render nothing. Worth generalising: every
`?? null` that resolves to "show no warning" is this defect waiting to happen,
and the question to ask of each is *"is this null the absence of a problem, or
the absence of knowledge?"*

### A contract's security block is a design constraint

SCRUM-151's three operations split by audience, and the split decided the
screen:

```
POST /verify    public        the token IS the credential
GET  /          HTTPBearer
POST /resend    HTTPBearer
```

Anybody opening a confirmation link is by definition not signed in, so the
expired-link screen **cannot offer a resend button** — the only endpoint that
could send one needs a session the reader does not have. Read the `security`
block before drawing the control; it is the cheapest design input in the
document and nothing else in these docs had been reading it.

### Carried, and NOT verified by this session

Relayed 22 Sep and recorded so they are not lost. **Each needs re-deriving
before it is planned around** — rule 3, and three of these are claims about
documents this session has not opened.

- **SCRUM-149's import result is now built on derivation, not rejection.** If
  so it changes `RejectedRows` (#473), which lists server rejections per row.
  The spec doc has not been read here. Read it before touching that component.
- **Per-child transformation metrics are formally withdrawn.** Nothing in this
  console rendered them, so this closes an ask rather than changing code.
- **The learning support surface goes to counsel DISCLOSED, not withdrawn.**
  Accommodations, the IEP export and per-learner adaptation counts stay built
  while Oladayo rules. The reopen trigger stands; the surface does not come
  down in the meantime.
- **D15d changed 101 lines.** Re-pull the design repo before the growth-view
  prose check. That check is still waiting on parent logins.


## THE AGE CHECK — a whole feature shipped, and nothing renders it. 21 Sep

**Found by reading `CompleteParentConsentRequest` in full instead of adding the
one field CI was red on.** The `grantedTypes` 422 was the visible symptom of a
ruling landing. This is the rest of it, and it is not a field — it is a
resource, two endpoints, three schemas and a boolean that can stop a child using
the product.

### What is deployed

| | |
|---|---|
| `GET /api/v1/age-checks` | **Never called.** The exception queue. |
| `POST /api/v1/age-checks/{age_check_id}/resolve` | **Never called.** Takes `AgeCheckResolution {agreedDateOfBirth, note?}`. |
| `AgeCheckState` | `matched \| mismatch \| resolved \| awaiting_parent` |
| `AgeCheckResponse.blocksAccess: boolean` | **Required.** A child who cannot use Nevo. |
| `CompleteParentConsentRequest.childDateOfBirth` | Optional, **never sent**. |
| `CompleteParentConsentRequest.parentRelationship` | Optional, **never sent**. |
| `ParentConsentCompletionResponse.declinedTypes` | **Never read.** |
| `ParentConsentCompletionResponse.ageCheck` | **Never read.** Defaults `awaiting_parent`. |

The contract's own statement of the rule, on `AgeCheckState`:

> *"The school gives one on the roster and the parent gives one when they
> consent. They are compared rather than trusted, because a date of birth
> decides whether a child is old enough for the product to be offered to them at
> all, and a single unverified source is not a check."*

### Why no gate caught it

`contract-check.mjs` check 2 reports spec fields the client ignores — but only
on endpoints the client already calls. `/api/v1/age-checks` is called by
nothing, so it produced no output from any of the four gates. `declinedTypes`
and `ageCheck` appeared in the advisory only because they hang off
`/consents/parent/complete`, which we do call. **The two most consequential
things here were the two the tooling could not see.** See rule 3.

### The three things this needs, and none of them is ours alone

1. **The parent screen never asks for a date of birth.** `childDateOfBirth` is
   optional, so nothing 422s — the check simply never runs, and `ageCheck` stays
   `awaiting_parent` for every consent we have ever completed. Adding a DOB field
   to D01b is a **design change to a statutory screen**, not a wiring job.
2. **`blocksAccess` has no owner.** It is required on every `AgeCheckResponse`
   and nothing in any console reads it. If it is ever true, a child is locked out
   and **no screen in the product explains why** — not the student's, not the
   teacher's, not the admin's. This is the part that should be settled first.
3. **The admin queue is buildable today and is a reopen trigger.** `GET
   /age-checks` plus `POST /{id}/resolve` is a straightforward exception list:
   two dates, a name, a state, and a resolution that requires the agreed date.
   Every field on `AgeCheckResponse` is required, so there is no absence to
   design around. **No frame draws it**, which is the blocker — rule 10.

### What we must not do

**Not compute the comparison.** `state` is server-derived and `blocksAccess` is
server-derived. Comparing `schoolDateOfBirth` to `parentDateOfBirth` in the
client to decide what to show is rule 3, and it would be a client deciding
whether a child is old enough for the product.

**Not render an age as a judgement about a child.** `studentFirstName` and two
dates on an admin screen is a record; anything that reads as a verdict on the
child rather than a disagreement between two adults' paperwork is Zero-Tag.

### The one-tap conflict, now sharper

Raised at the call site in PR #479 and it has not gone away. `ConsentType`'s
description: *"Each is asked and answered on its own. A parent agreeing to
their child using Nevo has not thereby agreed to anything else."*
`CompleteParentConsentRequest`: *"an empty list is a parent saying no to
everything, which is a real answer"*. `declinedTypes` exists on the response so
a decline can be recorded.

D01b is **one button**. It cannot express a partial grant and it cannot express
a decline. Today that is survivable because invitations only ever request
`data_processing`, so the single Yes grants exactly what was asked — but
`cross_border_transfer` is modelled and is precisely the thing a parent must be
able to refuse separately. **Design ruling needed before any invitation requests
a second type.**


### Blocked on backend — SPLIT INTO PRE-LAUNCH AND v1.5, 16 Sep

This was one undifferentiated table, which meant fifteen items arrived at backend
carrying equal weight — so the three that can hurt a school queued behind a
six-year rate table nobody needs yet. **Three are pre-launch. One more is
pre-launch and is not backend's at all. The rest are v1.5.**

#### PRE-LAUNCH — ~~three~~ ~~two~~ ~~ONE~~ **ZERO backend asks, 22 Sep**

All three are closed. The last one closed by being **wrong about us**, which
is the only reason this heading is worth reading twice: we recorded a silent
truncation and filed it against backend, and the slice was in our own file.
See the term-dates row below.

**~~Send order, set 17 Sep: SSO certificate → IEP shares read → term cap.~~
TWO OF THE THREE SHIPPED ON 21 SEP AND ARE BUILT.** The list is down to the
term cap, which was last in the order and is now the whole of it.

The ordering stands as written, because the reasoning held: the term cap is the
only one actively destroying something a school typed, and it lost first place
to the fact that **no four-term school is onboarded yet**, so it is damaging
nobody today. The other two were the ones that could hurt somebody first. **A
quiet loss you can still discover ranks below a silent one you cannot see
coming.**

**~~IT IS NOW A DISAGREEMENT, NOT A QUEUE POSITION.~~ CLOSED, 22 Sep — AND THE
TRUNCATION WAS OURS.**

Backend declined to raise the cap on billing grounds, and in answering told us
something that falsifies this row's central claim: **it was never truncating.**
A fourth date has always been a 422. What it returned was Pydantic's stock
*"List should have at most 3 items"*, which tells a school nothing — but it
returned something.

The silent drop was `termStartDatesFrom`, ours, ending `.slice(0, 3)`. **The
request that would have been refused was never made.** We cut the fourth date
off client-side and then reported the save as a success, which is the worse half
of the defect we had filed against somebody else. The test pinning it was called
*"respects the contract's cap of three"* — a name that made data loss sound like
compliance, which is why nobody re-read it.

Settled: the cap stays at 3 (billing issues one invoice per term start, so a
fourth date is a fourth invoice — a pricing decision before a validation one);
backend rewrote the 422 to say that; the form now stops at three and says why;
`termStartDatesFrom` no longer slices; and the calendar save renders the
server's message instead of "that didn't save". **Pre-launch backend asks: zero.**

**The lesson is not "check the cap", it is about where we looked.** We measured
the product's behaviour — a fourth term vanishes, no error — and then attributed
a cause we had not checked. The attribution was wrong and it pointed at another
team for a day. **Reproduce the failing REQUEST before naming whose it is.** The
network tab would have shown three dates leaving the browser.

| | |
|---|---|
| ~~**`AcademicConfig.termStartDates` has `maxItems: 3`, and it LOSES DATA**~~ **CLOSED 22 SEP. The row was right that data was lost and wrong about who was losing it.** Backend has always answered 422 for a fourth date; our own `termStartDatesFrom` sliced it off first, so the refusal never happened and the save reported success. Cap stays at 3 — one invoice is issued per term start, so a fourth date is a fourth invoice. The form stops at three and says so, the slice is gone, and the calendar save now renders the server's 422 message rather than a generic line. |
| ~~**Nothing reads back whether an IEP was shared — SAFETY**~~ **DELIVERED 21 SEP, BUILT 22 SEP.** `GET /api/v1/exports/iep/{export_id}/shares` landed exactly as asked — no new schema, the record had been written all along and simply never read. The SENCo screen now shows who holds a child's SEN report and when it reached them, and **renders `revoked` as its own sentence rather than a dimmer `shared`**: a revoked share is a guardian who no longer has the report, and the two must not read alike. A failed read of the list is held apart from an empty one, because "this hasn't been shared with anyone" is the worst sentence available on that screen and a 500 must never produce it. `TODO(api): sharedByName` remains — the history says when and to whom, never by whom. |
| ~~**`SsoConnectionHealthResponse` has no certificate expiry — LOCKOUT**~~ **DELIVERED 21 SEP, AND BUILT THE SAME DAY.** Retracted in place rather than deleted, because the way this row stayed open is the lesson. It read *"`certificate` is 0 occurrences spec-wide"* — a true statement about a substring, presented as a measurement of a capability. Backend built it as `credentialExpiresAt` / `credentialExpiresInDays` / `credentialExpiringSoon`. Now read by `SsoStatus` and rendered as an IT-home glance row gated on the server's own `credentialExpiringSoon` — **never on a day count of ours**, which would be rule 3. |

#### PRE-LAUNCH, AND NOT BACKEND'S — the DPA wording

Filed here so it stops being counted as an API gap, which is how it has been
read. **The blocker is counsel, not an endpoint.** `lib/mocks/dpa.ts` is
labelled a placeholder on screen and carries `TODO(legal): replace wholesale
when counsel returns the final wording`. The acceptance record shipped on 7 Sep
and is sound — version, accepting administrator, timestamp.

What backend's half would add is *drift protection*: SCRUM-39 asks for
`GET dpa {version, html}` so the text comes from the server rather than our
bundle. Without it, a school accepts "version X" and the words they read came
from whatever our build contained. **Worth landing at the same time as counsel's
copy, and pointless before it.**

**The DPA is one of six items with counsel, and they are now in one place:
[`docs/waiting-on-counsel.md`](./waiting-on-counsel.md).** Compiled 17 Sep from a
sweep of every `TODO(legal)`, every "counsel" mention in `src/`, and
`open-questions-consent.md`. Two things worth knowing from it without opening it:
**DPA clause 5 is the only open item that can invalidate merged work** — if
counsel reads Nevo as a controller rather than a processor, SCRUM-80 reverses and
the consent-gate correction shipped across the admin console on 11 Sep inverts.
And **Privacy/Terms have a gap counsel cannot close**: teachers tick an
activation-gating "I agree" at `SetPasswordForm.tsx:412`, the tick is never
transmitted, and no endpoint exists to record it — so when that version moves
there is no way to know who must re-consent. That one is a backend ask and can be
built now.

#### v1.5 — DEFERRED, DELIBERATELY

These are real and none is urgent. They are recorded so nobody re-derives them,
and they should not be worked before launch.

| | |
|---|---|
| SENCo active support | The last of D8b's three. **A COST blocker, not a capability one** — the route exists and works; 247 profiles is 247 requests to paint one list. `GET /api/intelligence/flags` on the SAME router already takes `studentId/classId/limit/offset`, so this closes with a query parameter rather than a new resource. |
| Assignment history proper | No actor on any assignment schema, and an ended assignment leaves no record (the DELETE returns no body, nothing carries `ended_at`). The dates shipped; the history cannot. |
| Settings — 4 sections | Promotion, two-step sign-in, school address/logo/band, and profile email/role-title. No endpoint for any of them. |
| `academicConfig` — the LABELS half only | Half of this row shipped; see the correction below. `termStartDates` is a validated schema field now. `yearGroupLabels` still rides on `additionalProperties: true`, so the map every screen reads through `yearGroupLabel` is a client-owned provisional contract. Lower priority than the three above it, and still worth settling before launch. |

**All four rows above were re-probed against the live spec on 16 Sep and all four
survive.**

#### AND NINE MORE THE TABLE NEVER HAD — added 16 Sep, all v1.5

The table was not merely stale, it was **materially incomplete**: every admin lane
probed had at least one contract-blocked state nobody had written down, including
an entire screen. Each row below was derived from the deployed document, not from
a comment. The three that were urgent have been lifted out to PRE-LAUNCH above;
what remains here is genuinely deferrable.

| | |
|---|---|
| **D09 Reports — the whole screen** | **Zero** of 343 schemas match `/report/`, and the only report path in 188 is `GET /api/admin/compliance-audit/report.pdf`. `/admin/reports` currently serves D20 instead. An entire admin screen with no contract behind it, and it had never been listed. **L** |
| **No PDF route for an IEP export or a learner profile** | The only PDF in the whole API is the compliance audit's, so both D8b's "Export Profile as PDF" and the exporter's "Download PDF" are absent affordances. |
| **`NotificationResponse` has no `category`** | `NotificationCategory` exists but is used only by preferences. Kills D13b's filter pill, the per-row label and category-scoped "Mark these as read". Three of SCRUM-100's six admin categories (roster, SSO, teacher) have no enum value at all. |
| **Compliance: erasure and subprocessors** | `erasure` = 0 occurrences spec-wide and `ParentRightType` is `request_data \| object \| withdraw_consent`; `subprocessor` = 0. Two of D22's four claims stay unverifiable even after the rights-log read lands. |
| **D19 invitations, three fields** | `InvitationResponse` has **no `classId`** (the CLASS column), **no created-at** (the "Invited 9 Jul" column), and `status` is `string \| null` with **no enum** — while `deliveryStatus` and `consentStatus` on the same schema ARE enums. |
| **`JoinInspectionResponse` has no name** | `{status, role, schoolName, expiresAt}`, so D19's "Welcome, Amara" greeting on the public join link has no source. |
| **Nothing queues parent consent for an INVITED student** | `POST /students/{id}/parent-consent-requests` needs a student uuid, and the contract never links an invite to one before acceptance nor mints a parent link from an invite's bare contact. **v1.5 rather than pre-launch, and the call is worth showing:** this looks statutory, because SCRUM-80 cites NDPA s31 and calls consent a launch blocker. It is a TIMING gap, not a hole — the moment a child accepts, they have a uuid and the request works. And SCRUM-80 also rules that Nevo is NOT the consent gate: a child may begin lessons either way, so a delay until acceptance costs the school a record, not a learner their lessons. If that ruling ever changes, this row moves up the same day. |
| **The DPA document TEXT** | Moved to PRE-LAUNCH above, and re-filed: the blocker is **counsel**, not an endpoint. `lib/mocks/dpa.ts` is a labelled placeholder carrying `TODO(legal)`. Backend’s half (`GET dpa {version, html}`) is drift protection and is pointless before the final wording exists. |
| **Overview period / date filter** | Nothing deployed carries a period or accepts a date filter for the five Overview figures, so SCRUM-39's period pill cannot be a control and every "this half-term" figure would be false. |

*Also real, lower stakes:* `SchoolRegistrationResponse` carries no session token,
forcing a second round trip at `SignUpStep.tsx:57`; onboarding writes band and
auth method into the untyped `profile` blob — the same provisional-contract shape
as `yearGroupLabels`, in a lane nobody had flagged; `PricingResponse` has no rate
schedule, so SCRUM-98's D11.3 six-year table has no source; and D20's headline is
blocked twice over (`AdaptationEventLogRow` has no `segmentId` and no `modality`,
and `studentFirstName` is REQUIRED on every row, which disqualifies it on an
aggregate-only screen).

**TWO ROWS CAME OFF THIS TABLE ON 16 SEP, AND THEY HAD BEEN WRONG FOR A DAY.**

- **Adaptation log TYPE filter.** `GET /api/admin/adaptation-log` takes
  `eventType` and has since 15 Sep. It is BUILT — `schoolIntelligence.ts:107`
  types the filter, `AdaptationLogView.tsx:189` sends it, and it shipped in
  `1a4d7e7` the same day.
- **`academicConfig` typed home.** Also `1a4d7e7`. `lib/api/school.ts:216`
  declares an `AcademicConfig` interface and backend validates `termStartDates`.

Both were listed here as "NOT buildable at any velocity" while sitting merged on
`main`, consumed by admin screens, in a commit whose subject line names them
both. **A blocked list decays faster than any other kind of note in this file,
because the thing that unblocks a row never edits the row.** Re-verify before
planning around this table — `node scripts/api-audit.mjs` against the live spec
takes under a minute and is what caught these.

**Not on this list, deliberately:** `POST /api/v1/students` has no caller and
500s, and that is fine. SCRUM-40 rules that "invites and enrolment live in D19,
not here", and the Students screen's "Enrol a student" routes to
`/admin/invitations` as it should. Direct student creation is not a flow this
console is missing — it is an endpoint nothing needs.

### The vitest worker flake

`Failed to start forks worker ... Timeout waiting for worker to respond` hit
five separate runs today, reporting "no tests" or a short count with exit 1 —
including a run that showed 398 of 466 passing and looked like a real
regression. It is worker-spawn contention between the parallel sessions, not
code. **`npx vitest run --no-file-parallelism <file>` is a reliable workaround**
and settled it every time.

### Every marker, with its verdict

| marker                         | verdict        | severity   | asks for                                                                                   |
| ------------------------------ | -------------- | ---------- | ------------------------------------------------------------------------------------------ |
| `CostSheet.tsx:38`             | still_true     | accurate   | Whether PricingResponse.vatRate is a percentage ("7.5") or a fraction ("0.075") - the cont |
| `ClassDetailView.tsx:52`       | partially_true | accurate   |                                                                                            |
| `ClassesView.tsx:37`           | still_true     | accurate   |                                                                                            |
| `InvitationsView.tsx:29`       | still_true     | accurate   |                                                                                            |
| `InvitationsView.tsx:34`       | still_true     | accurate   |                                                                                            |
| `JoinLanding.tsx:28`           | still_true     | accurate   | A name (or first name) on the public join-link lookup, so D19's "Welcome, Amara" greeting  |
| `inviteStatus.tsx:11`          | still_true     | accurate   | An enum on the invitation `status` field, so the four lifecycle values the frame draws are |
| `NotificationsView.tsx:32`     | still_true     | accurate   |                                                                                            |
| `NotificationsView.tsx:50`     | partially_true | accurate   |                                                                                            |
| `DpaStep.tsx:36`               | still_true     | accurate   | A GET endpoint that serves the DPA document TEXT (`{version, html}`) so the agreement word |
| `SignUpStep.tsx:57`            | still_true     | accurate   | A session (access token) returned by the school-registration call, so the wizard need not  |
| `ReportsView.tsx:60`           | still_true     | accurate   | A list of named school reports, each exportable as PDF or CSV, for the D09 Reports screen  |
| `IepExporterView.tsx:56`       | still_true     | accurate   | A read endpoint returning the share records for an IEP export, so share state survives a p |
| `LearnerProfileView.tsx:41`    | still_true     | accurate   | A PDF (or any document) route on a learner read, so D8b's "Export Profile as PDF" action c |
| `MoveStudentSheet.tsx:23`      | still_true     | accurate   | A way to schedule a class move for a future date (start of next term) rather than executin |
| `StudentDetailView.tsx:57`     | still_true     | accurate   | An enrolment date, a hand-enrolled-vs-roster-sync provenance line, and three per-guardian  |
| `TeachersView.tsx:38`          | still_true     | accurate   |                                                                                            |
| `TeachersView.tsx:43`          | still_true     | accurate   |                                                                                            |
| `AdminTeamView.tsx:44`         | still_true     | accurate   | Nothing from the API. It records that the scope-write endpoint exists and is typed, and th |
| `AdminTeamView.tsx:303`        | still_true     | accurate   | An endpoint the "Request another account" button could call to ask Nevo for an admin seat  |
| `adminScopes.ts:100`           | still_true     | accurate   |                                                                                            |
| `AdaptationLogView.tsx:33`     | partially_true | misleading | Three things: (1) a before/after pair on each adaptation event, (2) an eventType filter, ( |
| `AdminSignIn.tsx:34`           | partially_true | misleading | Two API gaps: (a) nothing resolves a school before authentication, so the D02 school eyebr |
| `AssignTeacherSheet.tsx:38`    | partially_true | misleading | A backend guarantee that assigning a new primary demotes the incumbent in one transaction, |
| `ClassDetailView.tsx:44`       | now_false      | misleading |                                                                                            |
| `ClassesView.tsx:46`           | now_false      | misleading |                                                                                            |
| `ndpaClaims.ts:53`             | partially_true | misleading | Four school-level figures the screen says it cannot verify: a consent coverage count, eras |
| `JoinLanding.tsx:33`           | partially_true | misleading | A student-side route that reads the join token off the query string and redeems it, matchi |
| `deliveryCopy.ts:30`           | partially_true | misleading | Either a consent state carried on the invitation itself, or an endpoint that queues a pare |
| `AuthMethodStep.tsx:26`        | partially_true | misleading | A real field to write the D1.2 sign-in choice into, instead of parking it in the untyped ` |
| `OverviewView.tsx:53`          | partially_true | misleading | Three things: (1) a narrative/summary endpoint, (2) a roll-up of items needing an admin de |
| `overviewGettingStarted.ts:28` | partially_true | misleading | A data signal for each of the three open checklist steps (teachers invited, sign-in config |
| `overviewSample.ts:14`         | partially_true | misleading | A single endpoint that rolls up the items at this school that need an admin's decision, to |
| `ReportsView.tsx:52`           | partially_true | misleading | Adaptation sequences keyed to a shared objective, so three anonymised learners' different  |
| `LearnerProfileView.tsx:46`    | partially_true | misleading | A dedicated source of titled per-learner observations for D8b's ENGAGEMENT PATTERNS, inste |
| `SencoView.tsx:56`             | partially_true | misleading | A bulk route that returns active support, lessons completed and adaptations-this-week for  |
| `AdminSidebar.tsx:29`          | partially_true | misleading | A profile endpoint that would supply the signed-in admin's real name and job title in plac |
| `SsoView.tsx:50`               | partially_true | misleading | A raw server-rendered sync log text blob to render verbatim in a <pre> behind "View techni |
| `EraseRecordModal.tsx:27`      | partially_true | misleading | A real retention deadline date to quote in the erase copy, in place of the frame's hardcod |
| `StudentDetailView.tsx:50`     | now_false      | misleading | A consent card, on the grounds that the student read carries no consent state, giver, date |
| `TeacherDetailView.tsx:42`     | partially_true | misleading | A last-active timestamp for an arbitrary teacher, an assignment-history endpoint, and a se |
| `NotificationRow.tsx:139`      | partially_true | stale      | A category field on each notification row, so the label can read as one of SCRUM-100's six |
| `BandStep.tsx:42`              | partially_true | stale      | A first-class enrolment-band field on the school resource, so the band is not stored as an |
| `IepExporterView.tsx:59`       | partially_true | stale      | A PDF rendering route for a finalised IEP export, so the screen can offer Download PDF.    |
| `SsoView.tsx:194`              | still_true     | stale      | Nothing itself - it is a cross-reference pointing at the marker on the RosterSyncAccepted  |

---

## Admin password recovery, 10 Sep

`AdminSignIn`'s own failure copy told a locked-out proprietor to "reset your
password" and gave them **nothing to press**. `/auth/forgot-password` was a
nine-line placeholder. A proprietor locked out of their own school had no way
back in.

**Its docblock said "No reset endpoint exists anywhere in the spec."** Two do —
`POST /auth/forgot-password` and `POST /auth/password-reset/complete` — and the
TEACHER console has consumed both since 1 Sep. One of the four stale docblocks
the 10 Sep handoff flagged, and it had "a password reset endpoint" sitting in a
TODO(api) list for something already live.

**The screen is shared, not copied.** Both endpoints are role-agnostic, so the
only thing teacher-specific about `TeacherPasswordReset` was where its links
point; those are props now, defaulting to the teacher paths so that route is
untouched. A second copy would drift, and the existing one already carries the
reasoning that matters — the request shows the same confirmation whether or not
the address is known, so the screen cannot be used to discover who has an
account.

Three routes now: `/auth/admin/reset` (linked from sign-in),
`/auth/teacher/reset` (unchanged), and `/auth/forgot-password`, which is real
rather than a placeholder because **the backend composes the emailed link** and
this side cannot know which URL it points at. Its sign-in link goes to the
landing page, which carries both console doors — nothing at that URL knows
whether the person is a teacher or an admin, so picking one would be a guess.

2 e2e tests in a real browser, one mutation-verified: remove the link from
sign-in and the path test dies.

---

## Admin team invite — the 8 Sep defect in its sibling, 10 Sep

`AdminTeamView` rendered **"They'll get an email to set a password and join."**
Nothing supported it. The 201 carries `invitation_id`, `user_id`, `email`,
`role`, `scopes`, `invitation_token` and `expires_at` — and **no delivery state
of any kind**, unlike the student invites, which carry `deliveryStatus`
precisely so a screen can tell. So the console could no more promise an email
than deny one, and it now does neither.

**Worse, the response was discarded.** `.then(() => ...)` threw away
`invitation_token` — the only way to build an activation link — and then
`setTimeout(onSent, 1400)` navigated away, so the single copy was gone before
anybody could act on it. The same shape as the bulk import's dropped join
tokens, in its sibling surface, three days later.

The screen now holds the invitation on screen until the admin presses Done, and
hands over the link.

**The link had nowhere to land, which the handoff did not mention.**
`SetPasswordForm` in activation mode has been live against
`POST /admin/team/invitations/accept` — the ADMIN TEAM endpoint — all along, but
the only route rendering it was `/auth/teacher/activate`. So the one flow that
accepts an admin invitation was reachable only at an address reading "teacher".
`/auth/admin/activate` now exists and shares the component rather than copying
it. It is public by the same mechanism the teacher route relies on: the proxy
matcher lists `/auth/admin` exactly, not `/auth/admin/:path*`.

**Resend and revoke are absent, and said so.** There is no endpoint for either
on an admin invitation — unlike student invites, which have both — so the panel
states it plainly instead of offering a control that cannot work.

4 tests, three mutation-verified guards.

---

## Consent requests — the trigger nothing had, 10 Sep

`consentsApi.requestParentConsent` was typed with **zero callers**, and the
whole parent surface sat behind it: three finished, merged screens that no
family could reach, because nothing in Nevo could send anybody a link.

**Three of the four surfaces are live now.** D07's row action ("Send request",
the frame's own words), D07b's card action ("Send a gentle reminder" on a
pending request, "Sending…" in flight), and the Overview checklist's dead row,
which now links to `/admin/students` instead of reading `cta: "When ready"`.

**The parent's details come from the record, not a form.** The endpoint needs
`{parent_name, parent_contact, contact_method}` and `ParentLink` carries all
three, so the admin presses one thing — D07 is explicit that "sending a request
is deliberate and per-student". The roster row does not carry the link, so it is
fetched on the press.

**The receipt is READ, not assumed.** The endpoint answers 202 with
`delivery_status`, and only `sent` means a parent was written to. `queued` and
`processing` say queued. This is the same distinction the invite surfaces got
wrong until 8 Sep and it is not being repeated.

**A child with no guardian contact is not an error** — it is the ordinary state
of a child enrolled before anyone recorded one, and it gets its own outcome
rather than a failure. Nothing is posted on its behalf.

**Two drifts fixed on the way.** `ConsentDeliveryStatus` was narrowed to three
values in the client; the spec has four (`processing` was missing), so a real
value would have fallen through every branch. The response-shape check compares
property NAMES, not enum members, so it cannot see this class — worth knowing
about the tool. And `ParentLink.contact_method` is a bare `string` on our side
against an `email | sms` enum, so an unrecognised value is now decided by the
contact itself rather than passed through and 422'd.

**A stale docblock corrected, one of the four the handoff flagged.**
`overviewGettingStarted.ts` claimed "No endpoint reads consent for a roster, so
there is nothing to link to". `AdminStudentRow` carries `consent` — it is what
`blockedByConsent` counts on the roster header. Left in place as a struck-
through caution rather than deleted, because a docblock that stops being true is
the most expensive comment in a codebase.

9 tests, four mutation-verified guards.

**The fourth surface is not done:** the roster header's "N can't begin lessons
yet" clause still only counts. Settling the Overview checklist row from data
(rather than just linking it) also remains — it needs the Overview to fetch the
roster, which is a call that screen does not make today.

---

## Admin console — dialog dismissal, 10 Sep

**Every admin dialog could be dismissed while its own write was in flight**, and
none of the three routes could see the write. `Sheet` and `Modal` gated Escape,
the backdrop press and the X on nothing at all.

Nothing in `lib/api` carries an AbortController, so a dismissed request always
completes. The `.then` then sets state on an unmounted tree, React discards it
in silence, and the dialog's own honest copy is never shown to anybody: "the
class was created, but the teacher wasn't assigned", the half-applied count on
a bulk revoke, the erase confirmation. **That is the inverse of the law this
console has fixed fifteen times** - a write that DID happen, reading as one
that did not - and `WriteFailed`'s own header states the assumption every one
of those fixes rested on: "the dialog stays open and the button stays
pressable".

**THE RULE: reflex dismissal is inert while `busy`; deliberate dismissal is not.**

- **Escape** - inert. No target, no confirmation, and it is the gesture most
  likely to be fired BECAUSE a write is slow.
- **Backdrop** - inert. It fires on mousedown, before a release could be
  redirected, so it already catches a click meant to refocus the window.
- **The X** - stays live. It is the only route that must be acquired and
  clicked, the only one named in the accessibility tree, and the only one a
  keyboard reaches by decision. Every dialog already withdraws its own Cancel
  mid-write, so deadening the X too would leave a browser reload as the only
  exit - which loses strictly more than the dismissal does.

Three overlays already worked this way by hand and were the precedent:
`AdminSignOutModal` gates Escape on `!busy`, `BillingContactSheet` and
`SsoView` gate their backdrops. None has an X, which is why they were silent
on it. `AuthMethodStep` was already inert on all three and needed no change.

**THE TRAP, and it is the whole reason this could have shipped broken.** The
keydown effect's deps were `[onClose]`, and callers pass a stable handler - so a
`busy` read inside the listener is captured on the first run and keeps its
MOUNT-TIME value for the life of the dialog. The guard reads correctly in the
source and does nothing. A ref is the usual dodge and `react-hooks/refs`
forbids writing one during render, so `busy` is in the deps; re-registering a
document keydown twice per dialog is cheap. **There is a test for exactly this**,
and the mutation that drops `busy` from the deps kills it.

Nine dialogs wired, `aria-busy` on both panels, 14 tests, three
mutation-verified guards.

**Still open, logged rather than folded in:** the teacher-removal confirm strip
in `ClassDetailView` is inline, not an overlay, so the prop cannot reach it - it
has no in-flight state at all, its confirm double-fires, and "Keep them" stays
live mid-DELETE. `StudentDetailView`'s "Restore this student" fails the same law
by a different door (`.catch(() => undefined)`). Both are their own tickets.

---

## Admin console — Settings, 10 Sep

**`/admin/settings` was a nine-line placeholder, and the rail linked every admin
to it.** Twelve audit lenses never found it, because a screen with no logic in
it gives a logic lens nothing to indict. It only surfaced when the design
reference was checked against the routes rather than the routes against
themselves.

**The work already existed.** PR #210 built D12/D12b/D12c on 1 Sep and was
closed on 8 Sep **as stale, not rejected** - "admin settings now belong to the
admin session rather than this one... the branch is left in place, so the work
is recoverable if the admin session wants to pick it up". It is picked up:
cherry-picked onto main with two conflicts (`auth.ts`, `school.ts`, both
additive on each side and both resolved by keeping both).

**Two spec deviations fixed on the way in.** SCRUM-99 says "not tabs" twice -
in rule 1 and again in D12.1 - and it shipped as a `role="tablist"`. It also
rendered the school half for every admin, where D12.1 requires it "absent
entirely, not greyed" for a non-oversight admin, with a done-when of "a
billing-only admin sees a coherent page with no empty school section". Both are
now two stacks under super-headings, scope-gated, with the section index.

**What is genuinely absent, and stays absent rather than mocked:**

| section                     | why                                                                                                                                                                                                                                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D12.4b Promotion            | No endpoint. Needs a bulk year-group advance, a leavers pass and a 7-day undo; `PATCH /students/{id}/class` is a different operation. A control that appeared to move 287 children and silently did nothing would be dangerous.                                                                                               |
| D12.8 Two-step sign-in      | No endpoint anywhere - no enrolment, no secret, no verify, no recovery codes.                                                                                                                                                                                                                                                 |
| D12.6 Profile editing       | PARTLY BUILT, and this row said otherwise until 11 Sep. `PATCH /api/v1/users/me` is live and `AccountSettings` writes the name through it. `ProfilePatch` is `{firstName, lastName, subjects}` only, so EMAIL and ROLE TITLE stay read-only - email is an auth identifier and needs a verification flow, not a silent change. |
| D12.2 address / logo / band | `PATCH /school` takes `{name, profile, academicConfig, retentionPolicy}` only, and there is no logo upload endpoint.                                                                                                                                                                                                          |

**Three settings still live in an untyped blob.** `academicConfig` is
`additionalProperties: true`, so the term dates and the year-group label map are
a provisional contract - the third in this codebase after the onboarding block
and the school contact. The labels are the load-bearing one: every screen reads
them through `yearGroupLabel`, and nothing validates the shape. **This wants a
typed home before launch.**

Retention, by contrast, is a real enum and matches the spec exactly:
`contract | contract_plus_3_years | contract_plus_7_years`, with no indefinite
value - D12's "12 months" option is not offered because no enum value exists
for it.

---

## Admin console

**That sentence used to read "every frontend-fixable launch blocker is shipped,
and nothing in this console is frontend-blocked any more". It was wrong.** On
8 Sep the billing screen turned out to have five, and they had been live the
whole time — see **Billing was broken against the deployed contract** below.
What is true is narrower: every blocker anyone had LOOKED FOR was shipped. The
console had never been checked against the deployed contract field by field,
because the tool for that only checked half of it.

Surveyed in depth 6 Sep (eight-dimension audit at `87192e8`, every blocker
adversarially re-verified; the quality and ops dimensions did not report, so test
debt and deploy/monitoring remain unassessed). That audit found nine launch
blockers; all nine are closed, seven by PRs #251, #257, #258, #264, #267, #269
and #281, and two by the 7 Sep backend deploy.

### Audited again, 8 Sep — 15 more, and they are NOT all fixed

A second sweep ran twelve independent lenses over the console against a clean
checkout, and put every candidate through three adversarial skeptics (does the
code do this; is it actually launch-blocking; is it already known or shipped).
**85 candidates, 15 survived.** Ten of the fifteen are ONE defect wearing ten
faces, which is why they were invisible one screen at a time:

> **A write that failed looked exactly like a write that succeeded.**
> `.catch(() => setConfirming(false))` closes the dialog, drops the spinner and
> returns the screen to rest — which is byte-for-byte what the admin saw the
> last time it worked.

**Shipped (this PR):** the five where the fix is "say it, keep the affordance,
and put the message where they are looking" — `WriteFailed` is the shared
primitive, the mirror of `ReadFailed`:

| screen                 | what a refusal used to do                                                     |
| ---------------------- | ----------------------------------------------------------------------------- |
| Notifications          | cleared every unread dot anyway; "Unread only" then said "You're up to date." |
| Class detail — archive | closed the dialog; the class stayed live on every list                        |
| Class detail — restore | nothing at all, and the button stayed double-clickable                        |
| SSO disconnect         | painted its only message _behind_ the modal still covering the screen         |
| Student deactivate     | swallowed entirely, under the words "their seat frees up"                     |

All five are pinned by tests and mutation-verified: each guard was collapsed
back to its pre-fix catch and the right test failed.

**ALL FIFTEEN ARE SHIPPED**, across PRs #301, #303, #306, #310, #312 and #314.

**CORRECTION (9 Sep).** Four PR bodies and this section said a "minor
notification-row item" was still open. It never was. That came from reading
`reproduce:NotificationRow.tsx` in the labels of agents that DIED on a session
limit during the audit - an unverified candidate, not a confirmed finding - and
repeating it without checking it against the confirmed fifteen. Nothing about
`NotificationRow` was ever confirmed. If you went looking for it, that is why
you found nothing.

### Closed out and re-audited, 9 Sep — READ THIS BEFORE TRUSTING THE FIFTEEN

The fifteen were re-verified against a clean checkout of main, one skeptic per
finding, asking whether each fix was actually closed rather than whether the
original finding was real. **Five were not** (3, 4, 5, 9, 15), one had shipped
with no test that could fail (12), and two of the fixes had introduced new
defects. All of that is now fixed in a seventh PR; the numbers below are after
that.

**The pattern, and it is worth carrying to the other consoles:**

> The six PRs taught the console to tell FAILED from FINE. They did not teach it
> to tell IN FLIGHT from ANSWERED.

`AssignTeacherSheet`, `SencoView`'s per-class fan-out and the IEP exporter each
had two read states where they needed three, and `[]` plus `failed: false` are
also the values on first render. So each printed a signed statement about a
school's staff, a class's children or a roster during the window when nothing
had answered - and `AssignTeacherSheet` had been made WORSE, because the new
copy ("No staff to assign yet. Invite a teacher first") is an instruction where
the old wrong sentence was merely inert.

**The tests could not see any of it**: every mock in the admin suite settled
synchronously, so a test asserting the empty-state copy passed against a promise
that never resolved. The pending-window tests now hold a request open with
`new Promise(() => {})`, which is the only way that state is reachable.

**Two regressions the fixes introduced, both now closed:**

- `ClassesView` — narrowing `ssoSourced` to active classes while the Create gate
  still read the raw list made it fail OPEN: an SSO school whose last live class
  was archived got "Create a class" back, which SCRUM-97 says must be absent.
- `SignUpStep` — the never-register-twice guard was local state, and the wizard
  unmounts the step whenever it moves on. Step 1's Back remounted it with the
  guard reset, so one press unlocked the fields on a school that already
  existed. `registration` lives on `WizardState` now.

**Three claims that were true in one direction and wrong in the other:**
`deliveryStatus` is nullable and the client casts JSON unchecked, so a null
took the confident arm in both invitation surfaces ("Invite resent to X", "N
invites sent") - the claim is asserted only on `sent` now, via `confirmedSent`.
`StudentDetailView` never cleared its failure flag on success. `LinkHandout`
told an admin on the invitations list to "resend from the invitations list".

What IS true, and is the real caveat on this audit: **the sweep never finished.**
Of 269 agents, 214 died on the session limit, so its own completeness critic,
second round and ranking never ran. 85 candidates were raised and only a
fraction reached a verdict. Fifteen confirmed and fixed is a floor, not a
ceiling.

~~_The invitation delivery family_~~ — **SHIPPED.** Both halves: the wording
now reads `deliveryStatus`, and the join links are handed over instead of
discarded. `needsManualDelivery` finally has callers. Details under
**The invitation family** below.

~~_The failed-read family_~~ — **SHIPPED.** All four, details below.

_Smaller:_

- ~~**`SignUpStep`**~~ — **SHIPPED.** See below.
- ~~**`SencoView` "Mark as seen"**~~ — **SHIPPED.** See below.
- ~~**`ClassesView`**~~ — **SHIPPED.** See below.

The full finding set, with the skeptics' reasoning, is in the audit output for
run `wf_107dccdc-839`.

### The invitation family — shipped 8 Sep

The console could create 200 staff invitations, email none of them, and report
"200 invites sent" over a navy tick. `InvitationDeliveryStatus` is
`not_requested | sent | email_not_configured`, and the contract's own words for
the last one are "the invitation exists and its link is valid, but nobody was
emailed, so the caller has to deliver it another way". Nothing read it.
`needsManualDelivery` was written for exactly this and had **no caller
anywhere**.

Wording alone would not have fixed it. The join `token` arrives on the create
response, `BulkImportModal` was the only thing holding it, and it was dropped
when the modal unmounted — while `NewInviteModal` was the ONLY place in the
entire admin surface that built a `/join/<token>` link. So a school whose import
emailed nobody had one recovery: revoke and reissue, one person at a time,
through a modal that rejects duplicates.

What shipped:

- **`joinLink.ts`** — the link, the invitee's display name, and a pasteable
  block, in one place instead of inline in one modal. Returns null on a missing
  token: `token` is nullable in the contract and only promised on create, and a
  button yielding `/join/null` is worse than an admitted gap.
- **`LinkHandout.tsx`** — the links for invitations nobody was emailed, with a
  per-row Copy and a Copy-all that produces a block a bursar can paste into
  WhatsApp. Rows without a token are counted and named, never faked. Scrolls, so
  a 200-row import does not push the modal's actions off screen.
- **`BulkImportModal`** — titles "N invitations created" rather than "N invites
  sent" whenever any row went undelivered, says how many, and hands over their
  links. A stale comment in that file asserted the bulk response "carries no
  delivery state at all"; it is wrong — `created` is an array of full
  `InvitationResponse` — and it had been justifying the false claim.
- **`InvitationsView`** — Resend reads the row it is handed instead of
  announcing "Invite resent to <name>" over an answer of `email_not_configured`.
  When nobody was emailed it opens the handout **in the row** rather than in a
  three-second toast, and every row that carries a token now offers Copy link.

14 tests, four mutation-verified guards.

### The failed-read family — shipped 9 Sep

The #269 shape again, in four screens that sweep never reached. All four now
distinguish a broken GET from an established fact, three of them through the
existing `ReadFailed` primitive.

- **`IepExporterView`** — the worst, because the empty list was also the
  disabled state. `.catch(() => setStudents([]))` left the picker with nothing
  to choose, so `studentId` stayed `""` and "Generate draft" was disabled
  forever with nothing on screen saying why: a SENCo sitting down to draft an
  IEP met a dead end. **The guardian read three lines below it in the same file
  got exactly this fix in #269** — its sibling was missed, which is the argument
  for grepping the whole file rather than the reported line.
- **`AssignTeacherSheet`** — one sentence covered three different situations and
  was true in one. A school that has invited no staff yet is the FIRST-RUN
  state — `ClassesView`'s own empty state tells them to "create your first
  class, then assign a teacher" — and it was told everyone on staff already
  taught the class. Now: a failed read says so, an empty roster says "invite a
  teacher first", and only a genuinely exhausted roster says everyone teaches
  it.
- **`SencoView`** — one roster request per class, each able to fail on its own.
  A class whose request failed contributed nothing to `classOf`, so filtering to
  it matched nobody and said "No profiles match", which reads as a fact about
  the records.
- **`TeacherDetailView`** — the mechanism was ARCHIVED classes, not a failed
  read: `classesApi.list()` excludes them, so a class archived at the end of
  last term went missing from the map, `?? 0`'d out of the headcount, and was
  still counted by the Classes card beside it. Now the list is fetched with
  `includeArchived`, archived classes are named rather than silently
  subtracted, and a class we genuinely cannot see makes the figure a stated
  floor ("in the classes we could read") instead of a total.

13 tests, six mutation-verified guards.

### The half-created school — shipped 9 Sep

The inverse of every other defect in this audit: a write that DID happen,
reported as one that never did.

Onboarding does two round trips — `POST /schools/register`, then a sign-in,
because the register response carries no session — and they sat in one promise
chain under one `.catch`. Register succeeds, the login times out, and the
proprietor reads _"That didn't go through, and nothing has been created yet"_
while their school and their own admin account both exist. Continue is still
armed, so they press it, register a SECOND time, and get "this email is already
set up with a school" — which reads as their mistake, on a school they
successfully made.

The two are separated now, and once the school exists this step will not
register again at any price: the fields lock and the only action left is to
retry the sign-in. The panel names the school, says nothing needs creating
again, and quotes the school code.

**`POST /schools/register` was typed `void` and returns a body.**
`SchoolRegistrationResponse` is `{schoolId, adminId, schoolCode}`, all required
— three facts the wizard was discarding, including the code the school signs in
with. The docblock asserting "declares a 201 with no body" was stale. It still
returns no SESSION, so the second round trip is still needed; that TODO stands.

### "Mark as seen" — shipped 9 Sep

The optimistic half of the #301 fix, now closed. The flag was flipped before the
POST returned and rolled back on failure — the usual trade, and the wrong one
here, because **the flag disappearing is what makes the card say "Nothing needs
your attention right now"**. Clearing the last open flag therefore stated the
SENCo's entire queue was empty on a write nobody had confirmed, and on a failure
the row returned with the reassurance already read.

It waits for the server now. The row stays, the button reads "Marking…" and
every row's control is held while one is in flight — two in-flight
acknowledgements would race each other's `setFlags`.

The rollback went with it: there is nothing to roll back if nothing moved. That
also removed a `setAckFailed` call from **inside** a `setFlags` updater, added
in #301 — a side effect in a function React is free to run twice.

4 tests. One of the two mutations survived and the guard is labelled as what it
is: `if (acking) return;` is a backstop, and the `disabled` on every row's
button is what actually enforces one-at-a-time and what the test reaches.

### The archived toggle — shipped 9 Sep

"Show archived" refetches with `includeArchived`, so the class list grows - and
the header summed straight across it. Pressing a filter to LOOK at last year's
groups changed the school's own figures underneath the proprietor: "14 classes ·
312 students" became "17 classes · 383 students", with nothing saying why, and
71 of those children in classes nobody teaches any more.

The header counts active classes now and states the archived ones separately
("· plus 3 archived"), so the toggle reveals rows rather than changing what the
school has.

**A second reader of the same list turned up while fixing it.** `ssoSourced` is
`classes.every(c => c.source === "roster_sync")`, and one archived
manually-created class from before the provider was connected would flip that
`every` the moment somebody pressed the toggle - putting "Create a class" back
on an SSO school, where SCRUM-97 says the control is ABSENT rather than
disabled. It reads active classes too now.

Same arithmetic as `TeacherDetailView` in #306: **`archivedAt` is the thing to
grep for.** Any figure summed across a list that an `includeArchived` fetch can
grow is suspect.

4 tests, two mutation-verified guards.

6 tests, three mutation-verified guards. **One of the three initially survived**,
and it was a fault in the design rather than the test: the never-register-twice
guard sat in `submit()` while the button's `onClick` already re-pointed to
`signIn` when registered, so nothing could reach it. Both actions route through
one entry point now, and the rule is provable by pressing the same button twice
— which is what a proprietor actually does.

The 7 Sep deploy changed the picture more than anything else this week - consent,
the school narrative, typed roster counts, per-student billing fields, a manual
transfer endpoint and a DPA acceptance record all landed together, and every
claim in it verified against the deployed spec first time, which had not happened
before on this project.

Still true: **43 `TODO(api)` in components**, spread across Students, Onboarding,
Teachers, Senco, Invitations and Classes.

### Billing was broken against the deployed contract — FIXED 8 Sep

Found by comparing `src/lib/api/**` to the live OpenAPI document field by field,
after `GET /api/billing/bank-transfer-details` turned up in `api-audit.mjs` as an
endpoint nothing consumed. Five faults, all shipped, all live:

1. **The cost sheet was blank for every school on earth.** `SubscriptionResponse`
   NESTED its pricing under `pricing` — `studentCount`, `perStudentRate`,
   `currency` — and the client still read `activeStudentCount`,
   `perStudentAnnualRate` and `currency` off the top level. All `undefined`, so
   `computeCost` returned null and the screen said _"Your per-student rate isn't
   set yet"_ to schools whose rate the backend was serving on that very response.
2. **Every figure was stamped with a naira sign.** `InvoiceResponse.currency` is
   REQUIRED and the client's `Invoice` never declared it. A GBP school read its
   own invoice history, its next charge, and its transfer instruction in naira.
3. **"How to pay" said the details were unavailable** while the account sat live
   on the API. The seam pointed at `/api/billing/receiving-account`, a path the
   spec has never had. Bank transfer is the ONLY payment route this console
   offers.
4. **A declined transfer read as a recorded one.** `PaymentOutcome.status` is
   `pending | success | failed | abandoned` and was never read: any 200 flipped
   the invoice row to "Pending verification".
5. **The invoice PDF was a plain `<a href>`** to a Bearer-protected route. Auth
   here is Bearer-only from localStorage, and a top-level navigation sends no
   Authorization header, so every PDF in the history 401'd.

Also: VAT was recomputed on the client at a hard-coded Nigerian 7.5% while the
contract carries the school's own `vatRate` and `vatAmount`; and money was
TRUNCATED rather than rounded, so the cost sheet's own working did not add up.

**Why nothing caught it, which matters more than the bugs.** `client.ts` ends in
`as T` — a cast the compiler never checks. `npm run contract` compared call-site
paths for `post`/`put`/`patch` ONLY, so 81 of 159 call sites, every read in the
client, were never compared to the spec at all. And the tests passed because the
fixtures were hand-written in the same wrong shape as the code: the fixture
agreed with the component, both disagreed with the server, and green meant
nothing. **A "contract green" claim made before 8 Sep covered writes only.**

### BUILDABLE — nothing blocks these

- ~~Sign out was absent entirely~~ — **shipped, PR #251.** The footer was a
  non-interactive `div` while the Bearer token survived a tab close in
  `localStorage`, so the next person on a shared staff machine was signed in as
  the proprietor.
- ~~Overview rendered D04's fixture "Worth a glance" counts to every school~~ —
  **shipped, PR #257.** A school with no lessons taught now gets D04's own
  "Getting started" checklist; a tick is only ever set from a signal we hold.
- ~~Both invite flows asserted a parent consent request was sent~~ — **shipped,
  PR #258**, and the gap behind it is now CLOSED. At the time nothing in the
  product requested consent at all: `requestParentConsent` was typed with no
  caller and could not be wired from the invite flow, because consent needs a
  STUDENT id that does not exist until an invite is accepted. The backend now
  queues parent consent automatically when an invited student with parent
  contact details joins, and invitations carry `consentStatus`. The copy still
  does not claim a request was sent - it says what is true either way.
- ~~`PermissionProvider` resolved once and never re-asked~~ — **shipped, PR #264.**
  It now separates an ANSWER from an ABSENCE: `ready` is final (including a real
  answer of no scopes), while `skipped` and `failed` are re-asked.
- ~~A 403 was treated as a dead session~~ — **shipped, PR #267.** 401 ends the
  session, 403 does not. Screens still show their generic "We couldn't load X" on
  a 403 rather than "you don't have access" — none surfaces the `ApiError`
  message, and threading it through ~15 screens is its own change.
- ~~Billing was a nine-line placeholder~~ — **shipped, PR #272.** Invoice history
  with real PDFs, next charge, renewal note and an editable billing contact, all
  against the live endpoints. The cost sheet and the "How to pay" panel are
  deliberately absent — see Standing asks 2 and 3; the screen tells the admin so
  rather than reading as unfinished.
- ~~Failed reads rendered as established absences~~ — **shipped, PR #269**, all
  five: Student detail, SSO ("Healthy" came from `history?.failed_runs ?? 0`
  coalescing a failed read into the healthy branch), Reports, and both
  notification surfaces. `components/admin/ReadFailed.tsx` carries the wording.
  **Now pinned by 13 component tests, added 8 Sep**, each mutation-verified by
  collapsing the guard and watching the right test fail. These shipped untested
  on a documented trap that turned out to be false — see the retraction under
  Testing.

- ~~The roster could not say who may begin lessons~~ — **shipped, PR #281.** D07's
  whole purpose. Consent column in four states, the "3 can't begin lessons yet"
  count clause, and D07b's card naming the actor and date. Two rules pinned by
  tests: an ABSENT consent renders "Unknown", never "Not sent", and consent is
  never derived from account status - a student can be Active and Withdrawn.
- ~~Billing had no cost sheet~~ — **shipped, PR #284.** `pricingModel` is a const
  `"per_student"` in the contract, so the dispute is settled there. Computed in
  integer minor units from the decimal string, from `activeStudentCount` - not
  `studentsProfiled`, not `invitedStudents`. VAT at 7.5% is Nigerian and is
  applied to NGN only; a USD or GBP school sees the subtotal and is told tax is
  not calculated here.
- ~~"I've made this transfer" was optimistic~~ — **shipped, PR #284.** It calls
  `manual-transfer` now. The bank reference is an IDEMPOTENCY KEY: a repeat
  returns the original transaction with a message saying so, and the panel shows
  the backend's own words rather than treating it as a failure.
- ~~The Overview disclaimed its own figures~~ — **shipped, PR #287.** The school's
  own narrative, plus the Classes and Teachers tiles that had no source at all.
  Active and invited are never summed - separate populations, per backend.
- ~~The DPA acceptance was an untyped blob~~ — **shipped, PR #288.** A typed record
  with the accepting admin. Client sends only the version.

### NEEDS BACKEND — all four closed on 7 Sep

| thing                     | outcome                                                                                                                                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin notification events | **Delivered.** Six admin types now arrive. The inbox needed NO frontend change to show them - it was built to render whatever comes - so it is no longer empty on day one. Typed in PR #288.                                     |
| School narrative          | **Delivered.** `GET /api/v1/school/narrative`, with `source` a const `"live_school_data"`. The Overview shows the school's own summary and the sample note is deleted, not reworded (PR #287).                                   |
| DPA acceptance            | **Delivered.** A typed record carrying version, accepting admin and timestamp. The client sends only the version; the rest is stamped server-side so it cannot drift (PR #288).                                                  |
| Scope enforcement         | **ANSWERED: scopes ARE enforced.** An admin token without `oversight` gets 403 from `GET /api/v1/admin/team`. That also confirms the 401/403 split shipped in PR #267 - 401 ends the session, 403 does not - was the right call. |

Still open, and NOT frontend work:

| thing                                | why                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A `category` on the notification ROW | `NotificationCategory` exists for preferences, but `NotificationResponse` carries only `type`. So the category filter, the per-category label and "mark these as read" have no source. Deriving one from `type` would be an invented mapping, and three of SCRUM-100's six admin categories (roster, SSO, teacher) have no enum value to map onto - this needs design and backend together.    |
| Receiving bank account               | **DELIVERED and wired, 8 Sep.** `GET /api/billing/bank-transfer-details` serves `{bankName, accountNumber, accountName, currency}`, all required — its own description reads "so the panel stops hardcoding it". The seam had been asking for `/api/billing/receiving-account`, which never existed, so every school was told the details were unavailable. Nothing is hard-coded now or then. |

### NEEDS DESIGN — ruled on 7 Sep

- **Non-oversight admin landing: DEFERRED to v1.5.** At launch the admin users are
  proprietors and academic directors; no school signs in with billing-only or
  curriculum-only scope. Ship Overview for `oversight` admins, which is what the
  rail already does. D17 and D18 stay unbuilt.
- **Changing an existing admin's scopes: DEFERRED to v1.5.** The endpoint is live;
  the UI comes later.
- **NDPA non-zero state (D22b): DEFERRED, do not build.** Design withdrew it -
  D22b superseding item 5 was their error. The safeguarding concern stands and
  counsel is to weigh in on the data shape first: a finding is
  `{table, recordId, field, term}`, where `term` is the flagged TEXT and
  `recordId` identifies a record, so rendering it school-facing risks showing a
  diagnostic label about an identifiable child. Four of D22b's six elements have
  no source either - no category, no description, no flagged date, no resolve.
- **`curriculum` scope: not in use at launch.** Reserved. No nav item, no route,
  and an admin holding only it would get an empty rail - deferred deliberately.
- **Settings scope: `oversight` IS the senior-admin scope.** Teslim is holding the
  remap until design says which sub-pages are meant, because moving Settings out
  of `it_sso` would lock the IT admin out of `/admin/settings/sso`.
- **D11d Plan Options: not built.** It introduces a second plan (per-term) that the
  locked v1 model does not have, and D11 says "no tiers, no plan selection" - design
  flagged the conflict themselves and D11 needs a follow-up to reconcile.

---

## Testing

Strategy is **defect-targeted first, full end-to-end second** - decided 6 Sep after
researching how comparable consoles are tested and scoring each option against the
four defects that actually shipped this week.

The finding that set the order: **the fixture fallback makes E2E structurally
dishonest here until it can be switched off.** `useLiveQuery` sets `failed` on any
rejection, 70 component files branch on it, and 31 import 2,541 lines of fixtures -
so an E2E asserting "the teacher sees their class list" PASSES when the live read
401s, because the fallback renders a class list. A green suite would ship a console
showing sample children to a real teacher.

Scored against the four real defects:

| defect                                     | caught by                     | not caught by                                          |
| ------------------------------------------ | ----------------------------- | ------------------------------------------------------ |
| Child congratulated for every answer wrong | one component test (sad path) | contract checks, MSW, snapshots, happy-path E2E        |
| snake_case posted to a camelCase endpoint  | the contract gate, in seconds | unit/component/coverage - **MSW would have hidden it** |
| Signals dropped on 401                     | one hook test on `flush()`    | E2E cannot - the screen is pixel-identical             |
| Login identifier invented client-side      | the gate's unread-field check | everything else                                        |

0 of 4 caught by E2E-against-mocks; 1 of 4 by E2E-against-a-real-backend.

### Done

**`scripts/contract-check.mjs`** - `npm run contract`, exits 1 on a violation, and
runs in CI. Adds NO dependency: it parses the TypeScript AST with the compiler that
is already installed, so the shared lockfile is untouched.

It exists because `client.ts:197` is `return (await response.json()) as T` - a cast,
not a validation - so every hand-written interface in `lib/api` is an assertion the
compiler never checks. The deployed spec types 154 of 182 operations, so the drift is
machine-detectable and simply was not being detected.

Three checks: request keys against `requestBody.properties`, string literals against
the spec's enums, and response fields the spec declares that no client type names.
Calls carrying `baseUrl` are skipped - those target our own Next route handlers, and
checking them against the backend spec was the gate's first false positive.

**`.github/workflows/ci.yml`** - the repo had no CI at all, which is how a lint error
sat on `main` for a day. Two jobs: types + lint, and the contract gate.

### What the gate found on its first run

- **FIXED:** `POST /api/intelligence/adapt` requires `segments` and the client sent
  `{studentId, lessonId}` only - every call would have 422'd. Not noticed because its
  only caller, `useAdaptation`, has no consumers.
- **RESOLVED 7 Sep (#260 / #262):** that same endpoint RETURNS `modality_suggestion`,
  `break_suggestion` and `proactive_adjustment`, and it IS the missing plan — Bearer
  with no role restriction, 200 to a student's own token, checked against the deployed
  API rather than inferred. `useAdaptation` now has a consumer, and the cast it used
  to do (`res as AdaptationPlan`, snake_case wire onto a camelCase type) is replaced
  by a real translation. See the adaptation traps in the student section before
  touching it.
- Advisory, unread by any client type: `ask-nevo` returns `plainText` and
  `answerFormat`; `baseline/submit` returns `baselineProfile` and `engineConfig`.

### Step 2 done — 17 tests, `npm test`

Vitest with two projects: `node` for pure logic (fast, no DOM) and `dom` for
hooks and components. A `*.dom.test.ts` suffix opts a `lib/` file into jsdom —
the session store is `localStorage` and `document.cookie`, so it is not pure.

Covered so far:

| primitive              | why it is first                                                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useLiveQuery`         | exists because FOUR hooks independently grew the same race — treating a slow answer as a failed one, stranding a teacher on sample data while their real class list had already arrived |
| `useSignals`           | where the silent 401 data-loss lived                                                                                                                                                    |
| session store          | expiry is the only thing between a stale localStorage token and a rendered roster                                                                                                       |
| `client.ts` auth latch | concurrent 401s once cleared the session, lost the role, and sent a TEACHER to the child's sign-in screen                                                                               |

**The suite is mutation-tested, not just green.** Removing the pre-auth guard from
`useSignals` fails exactly the test written for it; restoring it passes. A test that
cannot fail is decoration.

Environment notes, each of which cost real time to find:

- **`window.location` cannot be observed under jsdom 30, at all.** Redefining it
  hangs the worker for 60s with a timeout naming no file near the cause — from the
  setup file AND from inside a test, so placement is not the issue. Spying instead
  fails outright: `Cannot redefine property: assign`. When a redirect destination
  needs testing, **extract the choice into a pure function** and test that; see
  `sessionExpiredDoor` in `client.ts`.
- jsdom lacks `matchMedia` and ADDING it is fine — it is replacing what jsdom
  already implements that breaks.
- **A 60s "Timeout waiting for worker to respond" is not always real.** The same
  message appears for a genuine hang AND for a cold-start flake on a loaded machine.
  Before debugging, just run it again: a `.tsx` suite that timed out at 60s passed in
  6s on the retry with nothing changed.
- `vite-tsconfig-paths` is unnecessary: Vite resolves the `@/*` alias from
  tsconfig.json natively via `resolve.tsconfigPaths`. One fewer shared dependency.

**All four primitives are covered, plus the marking logic and the first judgement
screen — 59 tests.** Each was chosen for having a defect history, and every suite is
mutation-tested: reintroducing the bug it was written for fails that test and only
that test.

Step 3 added:

| what                          | why                                                                                                                          |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `checkpoints.ts` — 18 tests   | the marking rules decide what a child is TOLD about their own work. `answerKey: null` must mean "cannot mark", never "wrong" |
| `variants.ts` — 10 tests      | `interactiveVariant.answerKey` has the same nullable union, so the same way of going wrong; also the media-URL expiry margin |
| `FlagCard` — 7 tests          | first component test. "Worth your attention" is a judgement about a child shown to their teacher                             |
| `MasteryDualTrack` — 11 tests | "Reading support needed" is a label a teacher may act on for months                                                          |
| `LiveFlagCard` — 12 tests     | the live card, where the tap IS the acknowledgement                                                                          |
| `HomeClasses` — 8 tests       | showed other teachers' classes during every load                                                                             |
| `LiveClassInsights` — 7 tests | "still gathering" over a failure is a false claim about real children                                                        |

`FlagCard` tests what a teacher can READ and ACT ON — the name, the note explaining
the flag, the evidence behind it, where each action goes. **Not styling**: the design
frames are the contract for that, and asserting Tailwind classes would duplicate an
existing check while breaking on every redesign. The one visual thing asserted is
sudden-vs-pattern, because it is semantic rather than decorative.

Two behaviours in these are worth knowing about, because both fail SILENTLY:

- **`LiveFlagCard`'s tap is the acknowledgement.** Design ruled a teacher never sees
  an acknowledge button — tapping opens the profile and marks the flag seen in one
  action, and `useTeacherFlags` filters acknowledged flags out. If that write stopped
  firing, flags would nag forever with nothing on screen to explain why. The write is
  deliberately unawaited and its failure deliberately swallowed, so only a test can
  see it happen at all.
- **`MasteryDualTrack` has a deliberate gap in its auto-flag rule**: one track under
  40 with the other 40–59 flags nothing. That reproduces the frame rather than
  "correcting" it, and is flagged to design. It is now pinned by a test, so closing
  the gap becomes a decision with a failing test attached rather than a silent change
  to who gets offered support.

**The hook-driven components mock the HOOK, not the network.** `useLiveQuery` is
tested directly, so what these assert is that a component reads the flags its hook
publishes — which is precisely what both of them once failed to do:

- **`HomeClasses`** rendered fixture classes for the whole in-flight window, because
  `data === null` covers "not back yet" as well as "never coming" and the component
  read neither flag. A signed-in teacher saw JSS 2A, JSS 2B and SSS 1 Sciences —
  with invented headcounts — for the 1.0–5.6s the backend takes to answer. Now
  pinned: `loading` wins even when fixture classes are in hand.
- **`LiveClassInsights`** must never say "Still gathering insights for Year 7 Maths"
  over three failed reads. That is an affirmative, false claim: it tells a teacher
  Nevo looked and found nothing worth raising, when Nevo never looked. `failed` is
  checked before `empty`, and a state that is both renders as failed.

## End-to-end testing — prerequisites

E2E was sequenced last for one reason: **the fixture fallback would make it
dishonest.** An E2E asserting "the teacher signs in and sees their class list"
PASSES when the live read 401s, because the fallback renders a class list, which is
exactly what the assertion looks for. The suite goes green while the console shows
sample children to a real teacher.

### Prerequisite 1 — sample data is now detectable. DONE 7 Sep.

Rather than removing the fallback (it is load-bearing for the signed-out demo), every
fixture render carries a mark:

- `lib/sampleData.ts` — `SAMPLE_ATTR`, `sampleMark(kind)`, `sampleRegions(root)`
- `components/shared/SampleRegion.tsx` — wraps a fallback render. `display: contents`,
  so it takes part in no layout and changes nothing about the design.

Applied at the teacher lane's three fixture handoffs: `ClassRoute`, `LessonRoute`,
`StudentRoute`. The detector has its own tests, because an E2E built on a broken
detector would pass while the thing it guards against was happening.

**Three was never all of them — corrected 16 Sep.** `TeacherHome` and
`InsightsView` wrap too, and `CONSOLE_INVENTORY.md` section E found five teacher
surfaces still unmarked. No lane is finished; see the retraction under ACTION
NEEDED, which also explains why the grep everyone used to check could not find
them.

**The single most valuable E2E is therefore not a flow test.** It is:

> sign in, walk the console, assert `sampleRegions()` is empty everywhere.

That catches the failure this architecture actually has. Forty flow tests would not,
because the fallback satisfies them.

**FOR THE STUDENT AND ADMIN SESSIONS:** please wrap your own fixture handoffs in
`<SampleRegion kind="student:...">` / `kind="admin:..."`. The E2E is only as good as
the marks, and an unmarked fallback is invisible to it.

### Prerequisite 2 — a seeded tenant. DONE 7 Sep. The register bug is FIXED.

`scripts/shape-probe.mjs` records that the demo account holds **real school staff and
children**. A write-path E2E — assign a lesson, send a message, upload a unit —
mutates real people's records. So E2E needs its own school before it runs once.

**`POST /api/v1/schools/register` now works.** It was returning 500 on valid unique
input; re-checked 7 Sep and it returned **201 on four consecutive fresh registrations**
(3.4-8.0s). Backend fixed it. The blocker text that used to live here is gone because
it is no longer true.

**The E2E tenant exists:**

- school `E2E DO NOT USE - automated tests`, code **`751A1136`**,
  id `8afff4f0-1a7f-48c4-a99f-ab7d930fef01`
- the admin signs in via `POST /api/v1/auth/login/password` and gets role
  **`other_admin`** — which is correct, not a bug: `UserRole` is
  `student | teacher | senco_admin | other_admin | parent_guardian` and there is no
  `school_admin`. `isAdminRole` in `proxy.ts` already handles it.
- **every collection is empty** — `/students`, `/teachers`, `/classes`, `/invites` all
  return `[]`. That is the point: write-path tests cannot touch a real child here.
- `/api/v1/school` and `/api/v1/school/overview` both read 200. Note the path is
  `/api/v1/school` SINGULAR; there is no `/api/v1/schools/me`.

**Credentials are deliberately not in this file.** The password goes to CI secrets and
nowhere else. Ask Olayinka for it, or register a fresh one — it takes 5 seconds now.

Two caveats before writing against it:

- the admin address is on `example.com`, a reserved domain that **cannot receive mail**,
  so invite-delivery and password-reset flows cannot be tested end to end on this tenant.
  A tenant on a real inbox domain is needed for those.
- the school is empty, so a console will render its EMPTY states, not populated ones.
  Seeding one teacher, one class and two students is the next step if a test needs
  something to look at — and those writes are now safe to make.

### Signed-out E2E — DONE 7 Sep. 15 tests in 3 files, `npm run e2e`.

Playwright, chromium only, on port 3100 so it cannot collide with a dev server
another session is running. `webServer` does a PRODUCTION build rather than
`next dev` — dev overlays and slow compiles make timing assertions flaky, and the
build is what ships. Runs in CI with the report uploaded on failure.

**`e2e/route-guards.spec.ts`** is the one that genuinely needs a browser: the guard
lives in `proxy.ts`, which runs on the server between request and page, so nothing
below the browser can see it. Covers `/teacher/*` and `/admin/*` reaching the RIGHT
door, `?next=` surviving so signing in returns you where you were headed, and
`/student/onboarding` staying open — a child onboarding has no session by
definition.

**`e2e/public-pages.spec.ts`** leans on `/tosse`, the only surface that has been in
front of real schools and the one that broke there. Pins the three intent cards and
all five roles, including Teacher and Parent, which had no enum value until 6 Sep.
**Nothing submits** — a submission creates a real lead someone follows up.

Two things learned writing it:

- **Select by ARIA role, not by text.** The role dropdown assertion failed first
  time because it guessed a button name. The control is a real `combobox` with a
  `listbox` of `option`s, so `getByRole` asserts the accessibility markup and the
  contents at once — a text match would have passed just as well on a plain div.
- The landing page already asserts **no `data-nevo-sample` marks**. That is the same
  assertion the signed-in suite will make across the console, proven now on a
  surface where the answer is knowable.

### Prerequisite 3 — Playwright. INSTALLED and running.

`@playwright/test` `^1.63.0` is in devDependencies and `npm run e2e` works. The note
that used to sit here saying it was "deliberately NOT installed yet" was left behind
when the install actually landed; it is removed rather than corrected, because a
prerequisite that is met is not a prerequisite.

Auth will need the programmatic route: the token lives in **localStorage**, invisible
to the server, so `storageState` alone will not carry a session. Sign in via the API,
then seed localStorage before first paint.

### Next, in order

1. ~~Olayinka creates the E2E tenant~~ DONE — it exists, see above.
2. Playwright lands with the first spec — the no-samples assertion.
3. Then a small number of flow tests as deployment canaries, not defect detectors.
4. Then full E2E - which needs a fallback-disabled build mode and a seeded tenant
   first, because `shape-probe.mjs` records that the demo account holds real school
   staff and children.

### Traps found while scoping (do not relearn these)

- **A test file outside `src/lib`, `src/hooks` or `src/components` RUNS NOWHERE
  and reports nothing.** `vitest.config` includes `src/lib/**/*.test.ts` (node)
  and `src/{hooks,components}/**/*.test.{ts,tsx}` plus `src/**/*.dom.test.{ts,tsx}`
  (dom). Anything else is silently skipped - not an error, not a warning, and the
  suite still goes green. Five tests written at `src/context/PermissionContext.test.tsx`
  never executed once, and the run reported PASS with a higher total than before
  (another session's tests had landed the same afternoon), which is what made it
  look like they had run. If a file lives outside those three directories, name it
  `*.dom.test.tsx` so the `src/**` pattern catches it, and **check the reported
  test COUNT went up by the number you wrote**, not just that the suite is green.
- **A MOCK THAT NARROWS A SIGNATURE HIDES WHAT YOU ARE ASSERTING.** A spy wired
  as `acceptDpa: (v) => spy(v)` forwards only the first argument, so a test
  asserting "this call sends ONLY the version" could never fail - a second
  argument was swallowed before the spy saw it, and a deliberate mutation passed
  clean. Forward every argument (`(...args) => spy(...args)`). The tell was
  `tsc`, which separately flagged the mock as taking zero arguments; the test
  runner was perfectly happy.
- **MUTATE THE CODE TO PROVE A TEST MEANS SOMETHING.** Two tests written this week
  looked green while testing nothing at all - the one above, and five that were
  never collected because of the directory rule below. Breaking the behaviour on
  purpose and watching the RIGHT test fail is the only cheap check that a test is
  load-bearing, and it has caught a false green every time it has been run here.
- **Do not `grep | head` vitest's output.** It re-renders the summary line as
  files complete, so a truncated read catches an intermediate frame: this
  produced a confident "7 passed" mid-run on a 148-test suite, and a "no tests"
  on a file where 5 had passed. Read the tail, or the exit code.
- ~~**A component whose mocked API call REJECTS fails the file, even when the
  component catches it.**~~ **THIS ENTRY WAS WRONG. Retracted 8 Sep — ignore it,
  and do not plan around it.** Rejecting a mocked API call in a component test
  works exactly as you would expect. Three minimal reproductions (a direct
  rejection, a nested `.then(...).catch(...)` chain, and a `Promise.all`) all
  passed, and so did a reconstruction of the original failing test. Whatever the
  one stubborn failure on 7 Sep actually was, it was local to that file and not a
  property of the harness — and generalising it into a rule cost the five
  failed-read guards in #269 their tests for a day. **The lesson worth keeping is
  the meta one: one stubborn failure is a bug in one file until a minimal
  reproduction says otherwise.** All five guards now have tests, each
  mutation-verified: `SsoView`, `ReportsView`, `NotificationsView`,
  `NotificationsPanel`, `StudentDetailView`.
- **`container.textContent` runs elements together, so `` assertions silently
  cannot fail.** "Roster sync" followed by "Healthy" reads as `syncHealthy`, so
  `/Healthy/` never matches it — which means `expect(...).not.toMatch(/Healthy/)`
  PASSES on a screen that is shouting the word. This is the same class of false
  green as the two above and it is invisible: the assertion looks strict. Use
  `visibleText()` from `src/test/visibleText.ts`, which walks the text nodes and
  joins them with spaces (and folds curly quotes, so tests can be typed on a
  normal keyboard).
- **`npm run contract` only checked the paths of WRITES until 8 Sep.** The verb
  list was `["post", "put", "patch"]` and `api.del` was not in it under any name,
  so 81 of 159 call sites - every read - could name an endpoint that does not
  exist and the gate reported "No contract violations". It found the billing
  drift the moment reads were included, with zero false positives. If you are
  relying on a green contract run from before 8 Sep, it covered writes only.
- **The advisory "declared by the spec, named nowhere in the client" list is a
  real signal, not noise.** `GET /billing/subscription → pricing` sat in it while
  the cost sheet was blank for every school, because `pricing` was the key the
  whole response had moved under. Read that list.
- **A hand-written fixture proves nothing about the contract.** Every billing
  test passed for a week against a `Subscription` shape the API has never
  served. Copy fixtures from the deployed schema, not from the component you are
  testing.
- **Do not `git checkout --` a file to undo a mutation test unless the file is
  COMMITTED.** It restores from the index, not from your edit, and it took two
  files of finished work with it today. Commit first, then mutate.
- **Do not run the suite while a big workflow is running.** Under ~40 concurrent
  agents, `npm test` reported `23 files / 140 tests / 7 errors`; the same tree
  three times over, quiet, gives `30 files / 216 tests / 0 errors`. Worker
  startup times out under CPU contention and files silently do not run.
- `useLiveQuery`'s effect begins `if (!getToken()) return;` - a hook test with no
  token exercises zero network logic and passes having tested an early return.
- MSW handlers authored alongside the code inherit its bugs. A handler for the TOSSE
  form would have accepted `school_name`, because that is what the form sent.
- Coverage is misleading here: `src/lib/mocks` is 2,541 lines of trivially coverable
  static data, and defect #3's drop path WAS covered - it was simply wrong.
- Snapshots would have locked in defect #1: there was one snapshot, the success
  state, and it was correct. The bug was a state never rendered at all.

---

## Landing performance — measured properly, 7 Sep

**41 is the DEPLOYED number** (network + throttling). A local production build is
**73**, 3-run median `[72, 73, 74]`. An early single run said 65 — that was just a
slow run, and chasing it cost most of an afternoon.

**Shipped (#276):** the hero particle canvas animated at 60fps for the whole session,
long after the hero had scrolled away. Now gated on an IntersectionObserver. Correct
on the merits; the measured delta sits inside noise.

**Chased and abandoned — do not repeat.** The scroll driver is an always-on
`requestAnimationFrame` loop and looks like an obvious 2.5s win. It is not:

- The "2.5s" came from a **corrupt build**. Rebuilding while the old `next start`
  still held `.next` left a manifest pointing at chunks that no longer existed, so
  Lighthouse scored an **error page** 75.
- Rewritten event-driven (scroll + resize + ResizeObserver on the pinned sections +
  fonts + visibilitychange) and measured over 3 runs, it is **slightly worse**:
  median 72 vs 73, TBT 578ms vs 432ms, Style & Layout 2491ms vs 1585ms.
- The premise was wrong. `window.scrollY` does **not** force layout in a modern
  browser — it is cached — and the loop's `y !== _ls` guard means its body barely
  runs when idle. The loop is close to free.

**The pinned sections now have tests** (`e2e/landing-pinned.spec.ts`): panels advance
on scroll, the pin releases rather than sticking, classroom tiles reveal. Written to
catch the rewrite breaking them, kept because those sections are the most intricate
thing on the page and had no coverage.

**The client boundary is now split.** It ships less JavaScript; it does NOT move the Lighthouse score — see the numbers below before claiming otherwise. `LandingPage`
carried `"use client"` solely so it could call `useLandingMotion()`, and that single
directive pulled every section into the browser bundle: `ProofSections` and
`StorySections` have ZERO hooks between them and were shipping as client JS anyway.

`LandingMotion` is the boundary instead — a client component that calls the hook and
renders `{children}`. Children passed into a client component from a server component
stay server-rendered, so the sections became HTML. The hook needed nothing: it takes
no arguments and reaches the DOM through `document`.

|                 | before           | after                |
| --------------- | ---------------- | -------------------- |
| JS bytes on `/` | 808,881 (789 KB) | **774,524 (756 KB)** |
| chunks          | 16               | **15**               |
| HTML            | 62 KB            | 119 KB               |

**33 KB less JavaScript**, markup moved into HTML where it belongs. Verified with the
pinned-section tests plus a screenshot from a browser that actually paints.

**But the Lighthouse score did not improve.** 3-run medians: baseline **73**
`[72, 73, 74]`, after the split **70** `[54, 73, 70]`. TBT 432ms -> 514ms. LCP
unmoved at ~4.15s. The byte count is a deterministic measurement and is genuinely
lower; the score is not, and on this page it is dominated by an LCP the split does
not touch. The HTML also nearly doubled (62 -> 119 KB), which is the same content
moving across - cacheable and streamable rather than hydrated, but not free.

Ship it for the architecture, not for a number: a page of static marketing copy has
no business being a client component. Do not cite a score improvement, because there
is not one.

**Still on the table:** Style & Layout (~1.6s) and Script Evaluation (~1.3s) remain
the largest costs, and `ConversationSection` is still a client component - correctly,
since it is the conversion form.

### Two testing traps found the hard way

- **A hidden browser tab pauses `requestAnimationFrame` and stops painting.** Every
  screenshot returns blank and CDP reports "renderer may be frozen". I mistook that
  for a production bug across three surfaces before checking. **Check
  `document.visibilityState` before believing a blank screenshot.** Playwright is
  immune — headless browsers paint.
- `playwright.config.ts` used `??` for `E2E_BASE_URL`, so an empty string became the
  base URL instead of falling back. Now `||`.

---

## Cross-cutting

| item                    | state                                                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Tests**               | **1052 unit across 140 files, + 25 E2E across 4 specs.** Green on `main` (CI, 16 Sep). `npm test`, enforced by CI alongside types, lint and contract. See **Testing**. The 8 Sep figure in this row read "216 unit + 20 E2E" for a week after it stopped being true — re-measure before quoting it. |
| **Landing performance** | **41** deployed / **73** on a local production build (3-run median). Investigated 7 Sep — see below before repeating it.                                                                                                       |
| **Lint**                | Green as of 5 Sep (0 errors, 1 warning). Now enforced by CI.                                                                                                                                                                   |
| **Contract**            | Green as of 6 Sep. `npm run contract`, enforced by CI.                                                                                                                                                                         |
| **TOSSE**               | Working end to end and deployed. One test lead — `27ac8e8a-a46b-45e0-befe-50787d3b9eb9`, "DO NOT CONTACT" — still needs deleting from the booth list.                                                                          |

---

## Standing asks — where the four landed

All four were answered or delivered on 7 September. Kept here because the
answers matter more than the questions did.

**1. Per-student consent — DELIVERED.** `ConsentStatus` is now
`["not_sent","pending","confirmed","withdrawn"]`, and a typed `consent` object
(status, actorId, actorName, timestamp, channel) is on the student list, the
student detail and the class roster. Parent consent is queued automatically when
an invited student with parent contact joins. Built in PR #281.

_The second half of that gap is closed too:_ nothing used to request consent at
all - `requestParentConsent` was typed with no caller, and could not be wired
from the invite flow because consent needs a STUDENT id that does not exist until
an invite is accepted. The backend now queues it on join.

**2. The pricing model — RULED per-student.** ₦150,000/year or ₦55,000/term, no
tiers. `pricingModel` is a const `"per_student"` in the contract itself, and the
read carries `activeStudentCount`, `perStudentAnnualRate` and `currency`. Cost
sheet built in PR #284. The old `subscriptionTier` / `studentCountBand` /
`contractValue` are still returned and still never displayed.

**3. The receiving bank account — DELIVERED, and wired on 8 Sep.**
`GET /api/billing/bank-transfer-details`. It had been live since 7 Sep while the
client asked for a path that does not exist, so the panel told every school the
details were unavailable. Nothing was ever hard-coded, which was the point of the
seam; what was missing was anything watching for the endpoint to land.

**One question back to backend:** `PricingResponse.vatRate` is typed `string`.
Is it a PERCENTAGE ("7.5") or a FRACTION ("0.075")? They are the same rate and
differ a hundredfold on screen. Until it is settled the VAT line shows the
amount and no rate — a wrong tax rate on a school's invoice is not a rounding
error.

**4. Scope enforcement — ANSWERED: yes, enforced.** An admin token without
`oversight` receives 403 from `GET /api/v1/admin/team`. This was the one item
that was a question rather than work, and it settles two things: client-side
scope filtering is a convenience rather than the only guard, and the 401/403
split shipped in PR #267 matches how the backend actually behaves.

**One correction worth keeping.** `POST /billing/payments/{reference}/verify` must
NOT be wired for a bank transfer. It is a WRITE that asks Paystack about a
transaction and settles the invoice off the answer, so a bank reference 404s
there. Manual transfers go through `manual-transfer`.

---

## For backend

- The student-app handoff PDF diverged from the deployed spec on **every** item
  it described. Worth fixing at the source: people will type from it.
- `PartnerInquiryIntent`'s own description still says "PLACEHOLDER … confirm
  against SCRUM-117", though the values are now correct.
- The documented error envelope is `{detail: {code, message}}`; validation
  actually returns FastAPI's `{detail: [{type, loc, msg}]}`. A client that
  trusts the former shows a generic message instead of the real reason.
- Legacy lessons need reparsing before checkpoints can auto-mark: `toQuickCheck`
  skips every checkpoint whose `answerKey` is null.
- **Can a STUDENT's token call `GET /api/intelligence/accommodations/{student_id}`
  for their own id?** (asked 15 Sep) Every existing caller is a teacher or a
  SENCo. This cannot be answered from the spec — **student-only and admin-only
  routes declare byte-identical security blocks, so the document carries no scope
  information at all** — and the E2E tenant has no students to probe with.
  Shipped failing closed, so nothing breaks either way; but if it is staff-only,
  every signed-in child is making a request on every lesson open that can never
  succeed, and the accommodation can never be delivered. Precedent for optimism:
  `POST /api/intelligence/adapt` is on the same prefix and does answer 200 to a
  student's own token.
- **What characters can a `login_identifier` contain?** (asked 15 Sep) No
  `pattern` on any of the nine schemas carrying it — `string`, 1–50 — and no
  prose anywhere in the document describes the format. Every fixture we have
  uses `firstname.initial` with an optional digit (`amara.k`, `amara.k7`), and
  design is holding the child's keyboard layout on the answer.

- ~~**What should carry monotonic timing on a signal event?**~~ **WITHDRAWN 17 Sep,
  and it was my error.** I filed this as blocked on backend on the grounds that
  `SignalEventRequest.timestamp` is `format: date-time` and a `performance.now()`
  float has nowhere to go. That much is true; the conclusion was not. What the
  contract cannot take is the RAW monotonic value, not a timestamp DERIVED from
  one. I also wrote that `performance.timeOrigin + performance.now()` is "still
  wall-clock-derived, still moves if the device clock is adjusted mid-session" -
  false. `timeOrigin` is captured once and does not move, so anything derived
  from it is monotonic. The admin session caught both in the handoff above.
  **Fixed in the student lane, contract unchanged:** events are dated from a
  per-session anchor (`wall + (performance.now() - perf)`), so every
  within-session delta is the difference of two monotonic readings. A test
  drives the device clock backwards an hour mid-session and asserts a 250ms gap
  still measures 250ms; mutating the stamp back to `new Date()` fails it.
  **One question does remain, and it is for whoever owns the engine, not for
  backend:** ISO 8601 bottoms out at 1ms. Tap dwell, response latency and idle
  all live at 100ms and up, so 1ms reads as ample - but if affective inference
  needs finer, THAT is a contract ask for a numeric monotonic field, and the
  anchor above becomes its origin rather than its replacement.
- **`CalculationVariant` carries no manipulative structure, and §4 says it
  should.** (asked 17 Sep) Frontend §4: *"Backend supplies structure: kind,
  parts, rows. You render the manipulative. Do not substitute a static scaffold
  image, because the interaction is the mechanism."* The deployed
  `CalculationVariant` is `{type, fullEquation, answer, steps, scaffoldImage,
  completionStatement}`, and **no schema in the document has `parts` and `rows`**
  — checked across all 192 paths on 17 Sep. The only scaffold-shaped thing on the
  wire is `ScaffoldImage` (`imageUrl, storagePath, prompt, caption`), which is
  exactly the static image §4 forbids substituting.
  **What it costs.** `CalculationStep.expectedInput` includes `drag`, which is
  the tap-to-build input, and `fromContent`'s adapter refuses drag steps because
  there is nothing to build them on — the existing tray is constructed from the
  authored fraction variant's `parts`. So on generated content there is no
  manipulative at all, and §4's *"the one place modalities layer rather than
  switch"* cannot happen: there is no tap-to-build layer to run alongside the
  audio and the equation.
  **The ask is `kind`, `parts` and `rows` on `CalculationVariant`**, as §4
  already describes them. Until then the solver renders the equation and the
  steps and draws no manipulative, which is the honest reduced form rather than
  a picture built from numbers that mean something else.

### Affect and density — corrected 17 Sep, and most of it was not blocked

**"There is no affective transport" was wrong, and the error was the search.**
Recorded after grepping all 192 paths for `affect`, `emotion`, `frustration`,
`boredom`, `anxiety`, `confusion` and `socratic` and finding zero. Frontend §4
says the frontend *receives an instruction and never knows which state is
active* — so the absence of those words is the design working, not a gap.

The transport is **`AdaptResponse.proactiveAdjustment.action`**, which has been
on the wire and typed at `intelligence.ts:151` with no reader. §4 names six
actions: `no_action`, `modulate_density`, `increase_difficulty`, `offer_hint`,
`offer_break`, `show_socratic_panel`.

**Built:** the plan now carries the instruction, and the two actions that need
nothing the wire lacks are applied — `modulate_density` (secondary UI to 40%,
slower transitions) and `increase_difficulty` (the step-up pill, whose copy is
already §4's exact sentence). `offer_break` already had its own richer seam
through `breakSuggestion`.

**Deliberately NOT carried across:** `reason`, `confidence` and
`triggerSignals` ride the same object. Frame 38 — *"the learner is never shown
any of this reasoning, no score, no label, no 'you seem frustrated'"* — and
`confidence` is an engine parameter rule 3 keeps off every screen. A test
asserts none of the three reaches the plan.

**Two asks remain, and they are content rather than transport:**

- **`offer_hint` has no hint to show.** `ProactiveAdjustmentResponse` is
  `{action, reason, confidence, triggerSignals}`; no field carries child-facing
  hint text, and `reason` is not a substitute — it is the reasoning §4 forbids
  showing. The player's `FrustrationHint` takes a string and there is nothing
  to give it, so the action currently renders nothing.
- **`show_socratic_panel` has no questions.** `ConfusionSupport` takes 2-3
  guided prompts and no field carries them. Same outcome: nothing renders.

**One documentation ask.** `action` is a bare `string` with no enum, so the six
above are §4's list rather than the contract's. Unrecognised values resolve to
null and the interface does nothing, which is safe — but confirming the
vocabulary would turn a guess into a contract.

### The density entry above conflated two different things

**`modulate_density` is not the child's Simplify / Expand / Slower control**,
and filing them as one blocked item was the mistake.

- **The engine instruction** is a UI treatment — opacity, transition speed,
  gentler copy. It needs no new content and is built, above.
- **The child's pace control** (17 Lesson Player §C2) switches between
  *authored reshapes* of the same segment, and `TextVariant` is `{body,
  keyPoints}` with no reshape field. That half is still a genuine content ask
  and remains the one that matters most for the no-labels position, because it
  is how a learner asks the lesson to change without being told anything about
  themselves.

### The join-link hand-over, 18 Sep - 28c's other half

Design: *"A join link with nowhere to land was the right call when there was no
picker, and now there is one."*

A child taps their invitation on a shared tablet someone is signed into.
Onboarding then collects a name, a school and a class and runs the motor
baseline, none of which knows a session is live - so the measurements come from
whoever is holding the tablet and are written against whoever was still signed
in. The parked-baseline ownership guard stops the send; this stops the walk
starting under the wrong session at all.

**It lives in `WelcomeScreen`, not the route guard.** The session is in
localStorage, which no server can see, so `proxy.ts` cannot tell a token arrival
on a signed-in tablet from one on an empty tablet. The guard still lets
`?token=` through; the screen decides.

**What 28c made possible.** Signing the current child out used to mean losing
them - the device remembered exactly one. It now remembers six, so the screen
can say plainly that carrying on signs them out and that getting back in takes a
PIN, and have that be true. The promise is the feature.

**Ordering is the fix**: `clearSession()` runs before the first onboarding
screen renders, so nothing downstream can attribute itself to the child who was
here. The token is only written to the draft once the hand-over is taken, so a
child who chooses to stay does not end up with somebody else's invitation in
their draft. A `useHydrated` gate means neither screen is drawn before the
client can see the session - and it is scoped to token arrivals, so every
ordinary arrival keeps its server render.

### FOR BACKEND: relax the PIN pattern to four digits, 21 Sep

**Design settled the PIN length at FOUR on 21 Sep** - the 28c redraw stands, and
the question is closed on the design side. It cannot be implemented yet, and the
reason is a contract constraint rather than a disagreement.

Every PIN field on the deployed spec carries `pattern: ^\d{6}$`, checked 21 Sep:
`PinLoginRequest.pin`, `PinUpdateRequest.pin`, `JoinRequest.pin` and
`UnifiedLoginRequest.pin`.

**What shipping four against today's wire would do.** The screens would collect
four digits and submit; the server would refuse the shape with a 422 before
judging the credential; `classifyLoginFailure` maps anything that is not 401 or
403 to "ours", so the child reads *"We couldn't check that just now - that's on
us, not you."* No child could sign in on any door - the remembered-device
unlock, the unknown-device form, or PIN creation.

**The ask: relax the pattern to four digits, and say what happens to accounts
already issued a six-digit PIN.** The second half matters more than the first. A
child holding a six-digit PIN on a four-box screen cannot enter their last two
digits, and the screens auto-submit the moment the boxes fill - so they would be
locked out just as completely, and told it was their mistake.

`STUDENT_PIN_LENGTH` is the single constant all three PIN screens read. Once the
wire allows four, it is a one-line change.

### ANSWERED: the hint and the guided questions, 21 Sep

Both asks filed on 17 Sep are on the wire, checked against the deployed spec
rather than taken on trust: `ProactiveAdjustmentResponse` now carries `hint`
(nullable string) and `guidedQuestions` (string array), and both are ABSENT from
the schema's `required` list.

**What it unblocks.** `offer_hint` and `show_socratic_panel` were readable from
the day the action shipped and had nothing to render, so three of §4's four
affective responses could not reach a signed-in child at all. They can now.

**Carried only under the action they serve.** A hint arriving beside
`modulate_density` is dropped at the translator. The action is the instruction
and the text serves it; stopping it there beats trusting every future consumer
to check which action a string belongs to. Blank strings are treated as nothing
sent, because a whitespace hint opens a card with nothing in it.

**`reason` and `confidence` are still not carried.** These two new fields are
child-facing by design; that pair is the reasoning frame 38 forbids showing, and
the distinction is now the sharper one worth keeping straight.

**Still the nothing-state when an instruction arrives empty.** Neither field is
required, so that is a real case rather than a defensive one.

### MAIN IS RED: the contract gate, 21 Sep — parent lane, and it blocks every PR

**`npm run contract` fails on `origin/main`**, not on any one branch. Reproduced
on a clean checkout of main with the same two findings:

```
src/lib/api/consents.ts:144   POST /api/v1/consents/parent/complete requires "grantedTypes", not sent
src/lib/api/parent.ts:257     POST /api/v1/consents/parent/complete requires "grantedTypes", not sent
```

**The spec moved today.** A fetch this morning had
`CompleteParentConsentRequest.required = [token]`. A fetch this afternoon has
`[token, grantedTypes]`, and the schema also gained `childDateOfBirth` and
`parentRelationship`. Nothing in the repo changed; the wire did.

**Why this is not a two-line fix by whoever finds it.** `parent.ts:257`'s own
docblock records a design ruling: *"The token is the whole request - there is
nothing to choose, because design ruled one blanket consent and one tap, and the
invitation already carries which `consentTypes` it covers."* The client has no
per-type choice to report, so inventing a list would be fabricating a consent
record - which is the most serious version of this codebase's recurring failure
mode and is NDPA-relevant.

**The honest fix, and the data is already in hand.**
`GET /api/v1/consents/parent/{token}` returns `ParentConsentInvitationResponse`
with `consentTypes`, and `parent.ts:73` already types it. The parent screen
therefore already knows the exact set it showed the parent before they tapped.
Echoing that set back as `grantedTypes` is not a guess - it is the set they were
shown and agreed to, which is precisely what a blanket one-tap consent means.

**Not taken from here.** It is the parent lane's screen, the signature and its
call site both move, and consent is not a file to reach into from another lane
on an assumption. Flagged rather than fixed; it is a short job for whoever owns
it, and main stays red until it is done.

### BUILT: co-construction reaches generated content, 21 Sep

`CalculationVariant.manipulative` landed as `Manipulative`
(`kind, parts, rows, labels`) and is now read. Before it, `drag` steps were
refused because there was nothing to build a tray from, which dropped the whole
variant to text - so §4's *"the one place modalities layer rather than switch"*
could not happen on any generated lesson.

**ONE KIND IS DRAWN: `fraction_bar`.** The wire names five - `fraction_bar`,
`number_line`, `array`, `place_value`, `counters` - and design has drawn exactly
one of them: 17b's tap-a-quarter-into-a-four-part-bar. Checked across the whole
student frame set on 21 Sep; `number_line` appears only in the component
library, the intelligence layer and the UDL frames, never as a calculation
manipulative, and the other three appear nowhere.

**FOR DESIGN: the other four kinds need frames**, or a ruling that the pipeline
should not emit them. Inventing them would mean inventing four interactions, and
§4 is explicit that the interaction IS the mechanism - a wrong one is a
different task rather than a lesser version of the right one. Until then a
variant carrying one of them refuses its drag step and reads as text, which is
the honest reduced form.

**Two collisions worth knowing about.**

`Manipulative.rows` is NOT the player's `rows`. On the wire it is how many rows
of pieces to lay out (1-20, default 1); on the authored
`CalculationSegment.scaffold` it is `number[]`, the numerators of the fractions
being added. They are carried in separate fields for that reason - folding them
would draw a bar with as many divisions as there are addends. This is the second
time `CalculationVariant` has collided by name with a player type; the first is
why `fromContent` aliases its imports.

`target` - how many pieces the child places - is read off the drag step's own
answer, never computed. "3" and "3/4" both mean three pieces of a four-part bar;
anything that is not a whole number the bar can hold refuses rather than clamps,
because rule 3 keeps the frontend out of deciding what a correct quantity is.

**A drag step with no drawable manipulative is still refused**, exactly as
before. Handing a child a number pad for a task that asks them to build is the
same substitution §4 forbids for the scaffold image - a different task wearing
the right prompt - and most content still carries no manipulative at all.

### Two list items are smaller than recorded, 21 Sep

Raised by Olayinka and verified:

- **Mark a thread/notification read is a PORT, not a build.**
  `notificationsApi.markRead` and `markAllRead` exist and are already called by
  `components/admin/Notifications/NotificationsPanel.tsx` and
  `NotificationsView.tsx`. The student `NotificationBell` calls neither.
- **Ask Nevo lesson scoping is PROVIDER PLACEMENT, not wiring.** `AskNevo.tsx`
  already reads `useContext(LessonContext)?.lessonId` and sends it. It resolves
  to null because `LessonProvider` is mounted in
  `app/student/lessons/[lessonId]/layout.tsx` while `AskNevo` renders from
  `StudentShell`, which sits above that layout.

### SCRUM-167/168 takes the picker's names away, 21 Sep

Name and age leave student entry entirely, routing straight to the assessment
gated on consent. The join token is not to be relied on for a name.

**The consequence for 28c, which is worth deciding before it ships.** The
picker's names come from `rememberOnboardedStudent`, which takes the first word
of the draft's `name` - collected by the step being removed. So every newly
remembered child is nameless, and 28c-4 stops being the edge case and becomes
the norm.

Nothing breaks: the nameless tile is built and tested. But the frame's premise
inverts. It says *"the enlarged first name is the primary identifier and the
shape is a secondary cue for a child still learning to read"* - with no names,
the secondary cue is the only cue, and six children choose between six abstract
shapes on a shared tablet.

**The remedy is already written down as a TODO in `session.ts`:** the student app
does not read `GET /api/v1/users/me` yet, and the teacher console already does
through `useCurrentUser`. That would supply a real name after sign-in, which is
where a name can still legitimately come from. Worth routing in as part of
167/168 rather than discovering it on a classroom tablet.

### FROZEN: build nothing on `textVariant` or `segment.body`, 18 Sep

**Design's instruction, and it is a stop rather than a queue item:** *"Do not
build anything that depends on either field until it is answered, including
Simplify."* Escalated by design directly to Teslim as urgent, not filed as a
backend question.

**What is frozen.** Simplify (list S-B row 4), anything that would start reading
`segment.textVariant` in the student app, and anything that would change what
`fromContent.textFor` builds the child's text from. Slower is NOT frozen - it is
segmentation, and touches neither field.

**Why it outranks the pace control it was found under.** If the inference holds
- `body` is parsed source, `textVariant` is generated - then the teacher
approves `textVariant` and the child reads `body`. Design's words: the approval
gate *"protects text no child ever sees, and the text a child does read has been
reviewed by nobody"*. The C07b redraw was built on approval meaning something,
approval was given to the school as the answer to the mis-transformed lesson
question, and "your curriculum, not ours" would be untrue in the one place it
matters.

**The pattern design named, and the instruction that comes with it.** This is
the THIRD time the wire and the design have described different products:
dimensions was the first, `expectedInteraction` defaulting to `teacher_review`
was the second, this is the third. Design's hypothesis: *"Two parallel content
models, one for review and one for delivery, with nobody having decided that,
would explain all three at once."* **If a fourth turns up, raise it the same way
- as an inference, flagged as an inference, before building either side.** That
flagging is the reason design could act on this one.

### The child's pace choice holds for the lesson, 18 Sep

Design's ruling on the question left open when Slower shipped: *"It holds for
the current lesson and resets after. Never written to the profile, never sent
back to the engine as a value, gone at next sign-in."* Resetting every segment
would be maddening; storing it would make it an accommodation, which is the one
thing it is not.

So the pick lives in component state and nowhere else. A new lesson is a new
player, which is the reset. A segment that cannot deliver the chosen density
renders its default without clearing the pick, so it applies again on the next
segment that can.

**One false signal fell out of carrying it forward, and it had to be closed in
the same change.** The player reported a SYSTEM-sourced density trigger for
every segment whose plan named a density. Once a manual pick persists, the
system's density is no longer what is on screen - so every later segment would
have told the engine that an adaptation happened which the child never saw. The
trigger is now gated on there being no manual pick in force. Design on the
principle: *"A false reading signal is worse than no signal, because the engine
acts on it and the child pays for it."*

### 28c shipped, 18 Sep - the tablet remembers up to six children

The longest-standing student blocker, unblocked when design pushed the frame on
17 Sep and built the next day. The device remembered exactly ONE child, which on
a classroom tablet meant the previous child came back, found somebody else's
name on the lock screen, and had no way to their own account except a second
one - new login, no history, and a class they might not be able to rejoin.

**The split that shapes the code.** A PIN login needs a school code and a login
identifier, so both are stored; the frame allows the screen to show *"first
names and avatars only, nowhere a username, surname, class, school code or
last-used time"*. So components are never handed a roster entry. They get
`pickerEntries()` - a name, a shape slot and an opaque id - and the identifier
is looked back up by that id at the moment a PIN is submitted. A component that
cannot see a credential cannot leak one, which is stronger than remembering not
to render one. Verified on a real page as well as in tests: the rendered HTML of
a picker holding a nameless child contains neither the identifier nor the school
code.

**Every `rememberProfile` now also writes the roster**, and the delegation lives
in `session.ts` rather than at the two call sites, because two call sites is two
places to forget. Without it the picker would only ever show children migrated
from the old single-profile key and would empty out school by school as those
aged out. The legacy key is still written and read - `ForgotPinScreen` and the
sign-out destination still use it.

**Three places this departs from the frame, all flagged to design:**

1. **The avatar shape is stored per child, not derived from list position.** The
   frame assigns by index; entries are ordered by recency, so a child's shape
   would change every time another child signed in. The frame calls the shape *"a
   secondary cue for a child still learning to read"*, and a cue that moves is
   not a cue.
2. **The picker shows even for a single remembered child**, costing one tap on a
   one-child device. Going straight to a named PIN screen for one child IS the
   single-identity lock screen 28c exists to replace.
3. **Landscape side padding is 40px, not the frame's 64px.** The frame's own
   landscape numbers disagree: a 960px grid of six 142px tiles needs 932px, and
   64px padding leaves 896px on a 1024-wide tablet, so the frame's layout would
   wrap six children to five and one. Following the declared grid keeps them on
   one row.

**Not done, and it is the rest of the design batch:** the PIN screens still
carry their own pad rather than calling `NevoKeyboard`'s new presentation prop.
That is a separate change to a shared component used by more than this screen.

### The scaffold indicator has a fourth circle it could never show, 23 Sep

`/api/intelligence/scaffolds/*` - three deployed paths, no client module,
which is what list item S-A 17 asked for. Read 37a first, as instructed, and it
changed the shape of the work twice.

**THE INDICATOR WAS ALREADY BUILT.** `ScaffoldIndicator` and
`SCAFFOLD_LEVELS` have existed since the Intelligence Layer work. What was
missing was a source, not a surface.

**AND ITS FOURTH STATE WAS STRUCTURALLY UNREACHABLE.** 37a draws four circles -
Full scaffold, Moderate, Light, Minimal. The adaptation plan's
`ScaffoldingLevel` carries THREE values (`light | standard | strong`), so
`minimal` - one filled dot, the child who is flying - has never once been
shown to anybody. `adaptation.ts` maps what it can and is not wrong; it had no
fourth value to map from. `ScaffoldIntensity` has exactly four, in the same
order, and is the first source that fits the frame.

**WHAT 37a SETTLED, AND IT IS NOT WHAT I ASSUMED.** I had asked design whether a
support change announces itself, assuming rule 7 meant the indicator stayed
invisible. It does not: the indicator is permanent, top-right of the player,
opposite the exit. Rule 7 is honoured in HOW it changes - *"states cross-fade in
400ms; the circles just update, the label never animates."* The question is
answered and did not need asking.

**NO WORDS ABOUT THE LEVEL REACH THE CHILD.** The pill is four dots plus the
fixed word "Support". "Full scaffold", "Moderate", "Light" and "Minimal" are
annotations on the design sheet labelling each variant - they are not copy, and
nothing in the frame states a level in words.

**WHICH LEAVES `studentMessage` HOMELESS.** It is REQUIRED on
`ScaffoldDecisionResponse` and no frame has anywhere to put it. Typed so it is
not erased, rendered nowhere, raised to design. This is the `highlights`
situation and the ruling there was "do not build a surface for it".

**NEVER RENDERED, and they arrive on the same object:** `consecutiveCorrect`,
`responseTimeImprovementStreak`, `reducedHintStreak` - engine parameters,
exactly as `stability` and `retrievability` are - and `changeReason`, which
is the reasoning frame 38 forbids showing. The indicator has leaked an engine
parameter once already, through its accessible name.

**WIRED WHERE A CONCEPT EXISTS, WHICH IS A REVIEW SESSION.** The engine is keyed
per student per concept and `LessonSegment` has never carried a `conceptId`.
A review session is opened FOR a concept (`?concept=`), so it is the one place
the question has a subject. The two sources never overlap: the plan answers
where there is no concept, this answers where there is. **If a segment ever
gains a `conceptId` that stops being true**, and which wins becomes a real
question - flagged now rather than discovered then.

**NO ATTEMPT IS POSTED, AND `problemId` IS WHY.** It is required on
`ScaffoldAttemptRequest` and nothing in a lesson has one: `AssessmentQuestion`
carries a prompt, options with ids and a `correctId`, and no id of its own.
Deriving one from the question's position would key the server's per-problem
history to an array index that moves the moment content is re-authored;
deriving one from `correctId` would key it to the answer. The call is written
and typed so it works the moment an identifier exists. Raised 23 Sep.

**A read that does not answer shows nothing.** A concept never attempted and a
dropped connection are both "we do not know", and the indicator is a statement
about a child - so neither becomes a picture of how much help they need. A
weak test let a mutation through here: asserting the absence only after
awaiting "the call was made" passes whether or not the handler went on to fill
the gap. The settle is what makes the assertion mean anything.

### The scaffold attempt is posted, 24 Sep - and the field I asked for existed

`POST /api/intelligence/scaffolds/attempt` now has a caller. An answered
assessment question reports `{studentId, conceptId, problemId, responseCorrect}`
and nothing derived; the engine answers with the next intensity and why, none of
which is computed here and most of which is never rendered.

**THE `problemId` I RAISED WITH BACKEND YESTERDAY ALREADY EXISTED.**
`ComprehensionCheckpoint.id` is required on the wire and always has been.
`assessmentFor` builds each question from a checkpoint, reads the concept off
it and discarded the rest - and its own comment said the identity was dropped
"deliberately", which made an omission read as a decision. So from inside this
client the question looked like it had none, and the ask went out.

That is the **"grep for the capability, not the name we proposed"** rule in this
repo's own inventory, broken the same week it was written down. The comment is
corrected in place rather than removed, because the next person to read that
function is the person who would raise it again.

**WHAT IT REFUSES TO REPORT, and each is a way of being wrong rather than
silent.** No checkpoint id - an authored mock - because an id derived from a
question's POSITION would key the engine's per-problem history to an array index
that moves whenever content is re-authored. No concept, because guessing which
concept a lesson "is about" attributes an answer to something nobody said it was
about. No session, because there is nobody to record an attempt for.

**THE RESPONSE IS DELIBERATELY IGNORED.** The decision is the server's, the only
surface a support level appears on is the indicator, and the indicator is not on
screen during the after-lesson assessment - so there is nothing here to apply
`nextIntensity` to. Design ruled that a change of support announces itself
nowhere, so inventing a surface for it would be the one thing that ruling
forbids.

**TWO MUTATIONS SURVIVED, AND BOTH WERE TELLING.**

Removing `id: checkpoint.id` from the adapter passed every test in the repo,
because the player's own attempt tests hand it a hand-built question with an id
already on it - so the adapter that has to PRODUCE the id was never asked to.
A test now covers it.

And removing the first-answer guard passed too, which exposed that **a test I
had just written was a lie.** It answered wrong, answered again, and claimed to
prove the guard. It proves nothing: a wrong answer reveals and renames the
confirm to "Next question", whose onClick is `advance` rather than `confirm`,
so `onAnswer` cannot fire twice for one question. The guard stays - it costs
nothing and the scheduler write beside it shares the same map - but it is
defensive rather than load-bearing, and the test now asserts the invariant that
is actually true: one attempt per question across a whole assessment.

**AND THE FULL-SUITE METHOD FAILED AGAIN, DIFFERENTLY.** Two `npm test` runs on
the same tree reported `258 files / 2069 tests, 2 failed` and
`265 files / 2246 tests, 1 failed`. The second was right; the first had dropped
seven files under contention, the same way the JSON reporter did yesterday. The
one real failure was an existing whole-shape equality in
`fromContent.ending.test.ts` that my new field broke - correctly, because that
assertion exists so a field appearing there is a decision somebody makes rather
than something that slips in.


### Simplify has text behind it now, 23 Sep - and it was never `textVariant`

`depthVariants` landed on 22 Sep carrying `simplified` and `expanded`, written
at parse time, and **nothing read it**. The twelfth field on the
written-but-never-read list, on the one that finishes a mechanic.

**THE ROW SAID "BLOCKED ON `textVariant`" FOR A WEEK AND THAT WAS THE WRONG
FIELD.** Simplify needed text to switch to; `textVariant` was a guess at where
it would come from, and the real answer arrived under a different name. The
`textVariant` question is still open on its own merits - what it is relative to
`segment.body`, and whether a teacher approves text no child reads - it was
simply never what stood between the instruction and the screen.

**BACKEND KEYED IT TO THE ENGINE'S OWN ACTION NAMES ON PURPOSE.** Their schema
description: *"a client that has a plan saying `action: "simplify"` reads
`depthVariants.simplified` without a lookup table."* So `ProactiveAction`,
`DepthVariants` and the player's `Density` are three names for two halves of
one instruction, and `fromContent` is where they meet.

**EXPAND IS UNBLOCKED TOO.** Design deferred it on 17 Sep because *"it needs
content that does not exist"*. It exists.

**TWO WAYS A REWRITE IS NOT A REWRITE, and both are refused.** `body` defaults
to `""` on the wire, so an empty one is a field that exists and says nothing;
and a rewrite identical to the source is a toggle that re-renders the same
prose. That second rule is not new - it is what the player already applies when
it refuses to offer a density a segment cannot deliver. The key is OMITTED
rather than set empty, because presence of the key is what the player tests.

**`availableDepths` GOES BACK THE OTHER WAY.** The adapt request now names
which rewrites each segment actually has, so the engine stops instructing one
it has not got. **Omitted and `[]` are different answers** - backend's own
distinction, *"omitted means 'I didn't say'"* - and we have read the segment, so
`[]` is a positive claim rather than a silence.

**THE PLAYER'S OWN GUARD STAYS.** Telling the engine what exists does not
license removing the check on the rendering side: an instruction can still
arrive on a plan built before this field, and rule 5 does not stop applying
because an upstream got better. A test asserts the two sides agree on the same
segment, because the failure worth catching is them drifting apart.

**MY OWN FULL-SUITE CHECK WAS LYING ALL DAY.** `vitest --reporter=json`
reported `2026 passed, 0 failed` while silently omitting SEVEN test files -
173 tests - that pass when run directly. Exit code 0, nothing errored, the
files simply absent from the results. Plain `npm test` on the same tree:
**262 files, 2199 tests, all passing.** The JSON run cannot tell "green" from
"did not run", and every "whole suite passes" in today's earlier entries rode on
it. Re-verified with plain `npm test`; nothing was actually broken.


### A PIN change proves the old PIN now, 23 Sep - and it had to

Backend added `currentPin` and **enforces** it: on `POST /api/v1/auth/pin` as a
signed-in student whose account already has one, a wrong or missing
`currentPin` is a 403 `current_pin_required`. **So this is not a new feature,
it is a break we had to catch** - without it, changing a PIN would simply have
stopped working the moment the deploy landed.

**THE FRAME HAS DRAWN THIS SINCE THE BEGINNING.** Frame 27: *"Enter your
current PIN · Step 1 of 3"*. It was list S-B 9, open because the field did not
exist. It exists, so the step exists.

**STEPS 2 AND 3 ARE `PinCreationScreen` UNCHANGED**, and it needed no new
prop. `storePin` is the seam that already means "the caller knows how to store
this", so the change screen passes one that proves the old PIN first. That
component does not have to know this particular store has something to prove.

**A WRONG CURRENT PIN IS THE CHILD'S, AND THE COPY HAS TO SAY SO.**
`PinCreationScreen` renders *"we couldn't save that just now - that's on us,
not you"* for a rejected write, and that sentence exists because an earlier
version blamed a child for a failure no retype could fix. This is its mirror:
retyping IS the fix, and calling it our fault sends a child to find an adult
about something they could have solved. So `isCurrentPinRejected` is narrow -
that code, on that status, nothing else - and the flow returns to step 1, which
is the step that can fix it.

**THE PROMISE DELIBERATELY NEVER SETTLES** on that path, and it is worth
knowing why rather than tidying away. Resolving would tell `PinCreationScreen`
the PIN was stored and send the child to Profile on a change that did not
happen; rejecting would show them the "on us" copy about something that is
theirs. Neither is true, and the flow has already moved - the state change
unmounts that screen and its own cleanup marks it cancelled.

**`PinRow` IS EXPORTED RATHER THAN COPIED.** Two sets of PIN boxes eventually
disagree about the caret, the error colour or the count, and a child would meet
two different-looking rows inside one flow.

**THE PHYSICAL KEYBOARD IS WIRED ON STEP 1.** A child on a school laptop could
not type into either PIN door until 18 Sep; a new PIN screen that only took
taps would put that straight back, on the one door nobody would think to
re-test.

**A MUTATION SURVIVED THE SCREEN TESTS**, which is why there is a second test
file. Removing `currentPin` from the request body entirely passed every
screen test - the screen mocks `authApi.setPin` and only ever sees the
arguments it passed in. The body is built in `auth.ts`, so it is asserted in
`auth.setPin.test.ts`.

**STILL TO DO, AND DELIBERATELY NOT IN THIS CHANGE:** `STUDENT_PIN_LENGTH` can
drop to four now. All five carriers accept 4-8 digits (`^d+$`, re-checked
23 Sep), so design's four-box ruling is finally implementable - but a length
change touches three screens and the picker, and bundling it into an enforced
break would muddle both. Six still works, including an administrator's
generated reset.


### One warm-up a day, 23 Sep - and the cost was measurement, not tidiness

Design confirmed the done state: *"yes, one exists, and it says nothing about
performance. It closes and moves the child into the day's lesson."* **The screen
already had exactly that.** What it lacked was a memory that it had happened.

**THE WARM-UP WAS RE-SITTABLE ANY NUMBER OF TIMES A DAY**, and it is worth
being clear that this was not a cosmetic row. Every run reduces to a feature
vector and submits it, so a child who opened it four times sent four
measurements of the same dimension on the same day - and the engine
recalibrates on those. The fix is a guard before the run starts, not a
disabled button after it.

**NO SERVER ANSWER EXISTS, so this is a device memory.**
`BaselinePromptResponse` is `{dimension}` and nothing else, re-checked 23 Sep
and still list S-B 5's open ask. When the wire carries "done today",
`warmUpDone.ts` is deleted and replaced by it.

**KEYED PER CHILD, because the tablet is shared.** A flag on the device alone
would tell the second child of the morning that they had already done a warm-up
they have never seen - and the warm-up is the one thing on the dashboard
addressed to them. Yesterday's entries are pruned on write rather than
accumulating six children for ever.

**IT IS NOT A CLAIM ABOUT A CHILD.** A note that an activity happened, in the
same family as the device roster and the remembered rotate-prompt escape. Never
sent anywhere, never a measurement, and nothing in it says how the child did -
which is the line the done state itself already held.

**THE FAILURE FALLS TOWARDS OFFERING IT.** Private mode, blocked storage, a
corrupt value: all answer "not done", so a child does their warm-up twice
rather than being told they already did one they did not.

**DERIVED DURING RENDER, NOT SET FROM AN EFFECT.** The first version read the
flag in an effect and called `setDone`, which is the `set-state-in-effect`
purity rule this codebase has tripped before; lint caught it. `useHydrated` is
the sanctioned shape - and it is also better, because the done state is right
on the FIRST client render instead of after a flash of the activity.

**A MUTATION SURVIVED AND THAT WAS THE USEFUL PART.** Removing the write
entirely - so nothing is ever remembered - killed none of the first six tests,
because they all seeded the flag with `markWarmUpDone` and then proved the
GUARD reads it. Nothing proved the run ever writes it. The test that closes the
loop completes a real run, unmounts, and re-renders.

**STILL OPEN, AND IT IS A COPY QUESTION:** the dashboard card still reads
"Begin warm-up" once today's is done, and tapping it lands on the done state.
That is honest rather than wrong, but it is not what the card should say.
Deliberately not invented - design has not given words for it.


### The teacher's note reaches the child, 23 Sep - and it ships unnamed

Open since 18 Sep, ruled today. Design: *"It reaches the child. It appears on
the lesson screen, attributed to the teacher by name, drawn so it is
unmistakably a person's words rather than Nevo's. It never enters anything Nevo
generates about that child, and it is never rewritten, summarised or adapted."*

It nearly closed the way `highlights` did - *"do not build a surface for it"* -
and the difference is why it was asked rather than closed: a generated
highlight is Nevo's opinion about a child; this is a person who deliberately
typed these words TO them, so withholding it is not neutral.

**THE NAME DOES NOT EXIST ON THE WIRE, AND THIS IS THE ONE PART OF THE RULING
THAT COULD NOT BE BUILT.** `AssignmentResponse` carries `note` and nothing
saying who wrote it. Searched all 406 schemas: no `teacherName`, no
`assignedBy`, no `assignerName`, no `setBy`. The two near-misses both fail:
`lesson.createdByName` is whoever AUTHORED the lesson, a different person
whenever a teacher assigns someone else's, and `/classes/{id}/teachers`
returns a LIST rather than an author. **Putting one teacher's name on another
teacher's words is worse than naming nobody**, so it is signed "Your teacher"
and the field is a backend ask.

**NOT IN THE DENSITY PATH, AND THAT IS THE POINT OF WHERE IT LIVES.**
Everything inside `TextSegment` is subject to the reading density - Simplify
swaps the body for a shorter authored one, Slower chunks it - and the
accommodations reshape it further. "Never rewritten, summarised or adapted"
means a teacher's sentence is not a variant of anything, so it never enters
that component at all. `whitespace-pre-line` for the same reason: the line
breaks they typed are theirs. Both are tested by adapting the lesson around it
and checking the note did not move.

**ON THE FIRST SEGMENT ONLY.** A note is about the work as a whole; repeating
it above every segment turns a person's message into chrome - read once, then
ignored. It sits at the top of the reading column rather than in the fixed
header, so it scrolls away like the thing it is.

**NO NEW TYPEFACE.** The tempting way to say "a person wrote this" is a serif,
and this codebase defines no serif family - `--font-sans`, `--font-mono`,
`--font-brand`, `--font-heading` are the whole set - so `font-serif` would
fall through to whatever the browser has and read as a mistake rather than as a
voice. Quoted, italic, carded and signed instead, all inside the system.

**READ FROM THE CHILD'S OWN DASHBOARD**, not from `/assignments`, which is
"every assignment the teacher can see" - a child asking it for their own row is
the wrong actor on the wrong endpoint. And NOT carried in the URL beside
`?assignment=`: a teacher's sentence in a query string is a private message in
something a child can see, copy, share and truncate.

**A FAILED READ SHOWS NOTHING.** "Your teacher wrote something we could not
load" names a message a child cannot read and cannot ask for. A whitespace-only
note is no note, because an empty card signed "Your teacher" is a message about
nothing.


### Simplify is one path with two callers now, 23 Sep

Design ruled it the same day: *"`simplify` is the same operation as the 17 Sep
Simplify control. One is asked for by the child, one is decided by the engine,
and what happens on screen is identical. Build it as a single path with two
callers."*

**THREE LIVE INSTRUCTIONS WERE ARRIVING AND DOING NOTHING.** `ProactiveAction`
is `simplify | slower | expand | offer_hint | show_socratic_panel`;
`ADJUSTMENT_ACTIONS` predated the enum and shared TWO values with it. So
`simplify`, `slower` and `expand` fell through `asAdjustmentAction` to null
and the interface did nothing - silently, because an unrecognised action doing
nothing is rule 5 working exactly as written. **That is why no gate caught it,
and it is the shape to watch for: the failure mode of a correct rule.**

**THE JOIN IS `densityForAction`, AND IT IS A JOIN RATHER THAN A SECOND
IMPLEMENTATION.** The child's chip sets `density`; the engine's instruction
sets the system's density; both land in the same `effectiveDensity` and the
same `TextSegment`. Two code paths that both "simplify" would eventually
disagree about what simplifying is, and a child would get a different lesson
depending on who asked.

The three names are identical on both sides - `simplify`, `slower` and
`expand` are `Density`'s own values - which is a coincidence deliberately not
relied on. Mapping them explicitly means the day either list moves, it stops
compiling rather than quietly mapping a new action onto an old reshape.

**NO NEW GATE WAS NEEDED, and that is worth knowing rather than re-deriving.**
`densitySegments` already offers only what a segment can actually reshape
into, and `TextSegment` already falls back to `body.default`. So an
instruction the content cannot honour renders the default, lights no chip and
claims no adaptation. The existing rule - *"an offered density that re-renders
identical prose is the player telling a child it adapted when it did not"* -
covers the engine's caller as well as the child's.

**AND NO NEW SIGNAL.** The per-segment density report stays gated on the plan's
own density. Reporting `simplify_trigger` with `source: SYSTEM` because the
engine asked us to simplify would be telling the engine what it already knows,
and the existing comment warns about exactly that class of false signal.

**A CHILD'S OWN PICK STILL BEATS THE INSTRUCTION.** In a system that
deliberately tells a child nothing about what it is doing, the density control
is the only place they can ask, and an engine instruction silently overriding
that would take it away. Tested.

**WHAT WAS NOT DELETED.** `modulate_density`, `increase_difficulty` and
`offer_break` are not in the contract's enum and are HELD rather than removed,
on design's instruction - *"do not declare it dead yet"*. Each now says in the
constant why. `offer_break` is the one that is correctly absent: a break is
not an adaptation instruction and already has its own signal on
`AdaptResponse.breakSuggestion`.

**`textVariant` IS STILL OPEN, and this did not close it.** What
`textVariant.body` is relative to `segment.body` - and whether a teacher
approves text no child reads - is unanswered. It was simply never what stood
between this instruction and the screen.

**ONE TEST OF MINE ASSERTED A BEHAVIOUR THIS CODEBASE DOES NOT HAVE.** The
frame's standing density is `adaptive ?? Simplify`, so an authored segment
already opens on its Simplify reshape before any engine speaks - which means
"engine says simplify, Simplify appears" passes against a client that ignores
the instruction completely. The decisive case is Expand, which is not the
default and has to be asked for.


### Every door resolves consent now, 23 Sep - the half that was unruled is ruled

Design answered the same day. *"The gate is on the child's consent state, not on
the route they arrived by. Every entry path resolves consent before anything
mounts, and PIN sign-in is an entry path. A child in the same state meets the
same screen whichever door they use."*

**FOUR DOORS, ONE COPY OF THE RULE.** `lib/auth/entryGate` is the whole of it,
used by the returning sign-in form, the remembered-device unlock, the SSO
callback and - through `StudentEntry` - the entry link. Four copies of a rule
that decides whether a child can start is three too many.

**IT IS NOT A GUARD, AND THAT IS DELIBERATE.** Design ruled ENTRY. Whether a
child already inside the app is stopped from opening a lesson is a different
question and still unruled - it is what `consent-gate`'s `blocked`,
`admin/D25` PC-03 and the 7 Sep SCRUM-80 ruling disagree about. Running this on
every mount would answer it by accident.

**`blocked`, NOT `granted`.** `granted` is false in three of the four consent
states (`not_sent`, `pending`, `withdrawn`), so reading it would be the frontend
deciding a policy out of a field that does not state one. `blocked` is the
server's own answer to "may this child proceed?" - the field the parent lane
declared on 23 Sep precisely so it would stop being discarded.

**BEING HELD IS NOT A FAILED SIGN-IN.** The child is signed in, the device
remembers them, and then the question is asked - it has to be in that order,
because `consent-gate` is `students/me` and there is nothing to ask about until
the session exists. Tested.

**THE HOLD BEATS A DEEP LINK.** A bookmarked lesson in `?next=` would otherwise
walk straight past the gate, so the destination a child asked for is the case
the test names.

### The age check holds at the same screen, and the child is told neither reason

*"Same screen as 00d, same words, different state underneath. The child is not
told why."*

**THE REASONING IS THE PART TO KEEP**, because the obvious improvement here is
to explain. Design: a disputed date of birth is two adults disagreeing with each
other, and telling a child invites them to go and settle it - which makes a
child the arbiter between their parent and their school. From where the child
stands, Nevo is not ready for them yet, and that is true in both states. The
adults are told in full on the administrator's surface.

So `ageCheckPending` holds exactly as `consentState: "pending"` does, and a
test pins that the screen's entire text is the same two sentences in both
states - a later branch cannot grow its own words.

**THE ROUTE SAYS NOTHING EITHER.** `/student/waiting`, not `/student/consent`.
A URL is something a child can read.


### Consent is checked at entry now, 23 Sep - the half that is ruled

Frame 31 and frame 00d, from the 22 Sep drop, and `/api/v1/student-entry`,
which landed some time before 23 Sep and had no consumer.

**THE OLD SEQUENCE ASKED A CHILD FOR WHAT THE SCHOOL ALREADY KNEW.** It
collected name, school and class, sat them through the whole baseline, and only
redeemed the link at PIN creation. `GET /student-entry/{token}` resolves the
child FROM the token - `firstName`, `className`, `age` - and says where
consent stands before the first screen.

**WHAT SHIPPED IS THE LINK PATH ONLY, AND THE SPLIT IS DELIBERATE.** Frame 00d
rules that path in its own words: *"A student's link routes here only when
consent isn't in yet."* A new route `/student/entry/{token}` resolves once and
holds at 00d when `consentState` is `pending`.

**WHAT DID NOT SHIP, AND WHY.** A SIGNED-IN child is not held. That is the
unruled half: the parent lane raised on 23 Sep that `ConsentGateResponse`
carries a required `blocked` nothing reads, that `admin/D25` PC-03 says *"a
child stays out of lessons until they're cleared"*, and that the 7 Sep SCRUM-80
ruling - *"Nevo is not the consent gate, the child proceeds normally"* - has not
been withdrawn in words. They declared the field and left the behaviour, saying
it lands in this lane. **It does, and it still needs the ruling**, so nothing
here touches `students/me/consent-gate` or `processingWithdrawn`.

**A FAILED READ IS NOT A MISSING CONSENT.** Same ruling `useConsentGate`
already made for withdrawal: a dropped network, a bad minute and a child on 3G
are indistinguishable from "not consented", and holding on any of them turns an
outage into a wall a child cannot pass and cannot be told about. The destination
validates the link itself, so a genuinely dead link is still refused there with
words.

**NO POLLING, AND THE TEST SUITE PINS THE ABSENCES.** 00d replaced a gate that
polled, so the screen asserts no timer, no fetch, no button, no link, no
progress and no status - a later reader adding "check again" would be making a
reasonable local improvement that re-creates the screen this replaced. The
resolve is one call per token, guarded by a ref rather than by the effect's
cleanup: `router` belongs in the dependency list, so cancelling on re-run
would abandon the only request and re-requesting would poll.

**DECLARED AND DELIBERATELY UNREAD:** `accountReady` (two plausible readings -
"no account yet, create a PIN" and "not cleared to have one" - which route a
child to different screens) and `ageCheckPending` (a disputed date of birth is
not a missing consent; `AgeCheckState` is `matched | mismatch | resolved |
awaiting_parent`, it blocks access, and no frame draws it). Both asked 23 Sep.

**THE RE-SEQUENCED PIN CREATION IS FILED, NOT BUILT.** Frame 31 draws
"The Close -> PIN Creation" with no name, school or class step. Building it
needs `accountReady` answered. Until then a consented child is handed to
today's working onboarding, which is a reduction shipped knowingly rather than a
guess.

**ONE FRAME DIVERGENCE, FLAGGED:** the frame breathes the mark at 4s; the app's
`--animate-nevo-breathe` is 5s. Took the app's token, because one rate across
every breathing mark matters more than a second.

### The bell is markable now, 22 Sep - closing the hole that hid the leak

Flagged on 18 Sep and left open then: `NotificationBell` carried no
`SampleRegion`, and `StudentShell` mounts it outside both `MaybeSample`
wrappers, which cover the identity block and the avatar only. So when the bell
was inventing *"Ms Okafor sent you a message"*, the end-to-end sweep whose whole
job is to catch a console degrading to fixtures had nothing to assert against.
The leak was found by reading the file.

**THE MARK FOLLOWS THE BRANCH, NOT THE ROWS**, and that is the decision worth
recording. `SAMPLE_NOTIFICATIONS` is empty, so a mark that followed the rows
would mark nothing - and the failure this exists to catch is precisely the one
that leaves no rows behind: a SIGNED-IN child falling into the signed-out branch
and being told *"Nothing new right now"*, which is a claim about their feed that
nobody checked. That is exactly what the missing `useHydrated` guard did on
every student page until 18 Sep.

The unhydrated branch is deliberately NOT marked. It is a blank while the client
works out who is here, not a fixture, and marking it would put the attribute on
every page for everyone for a frame - which makes the mark mean nothing.

**`MaybeSample` moved to `components/shared/SampleRegion.tsx`.** It was private
to `StudentShell` and a second caller wanted it; two versions of "mark this only
if it is a fixture" eventually disagree about what counts, and the mark is only
worth anything while every surface means the same thing by it.

### Two fixture leaks emptied, 18 Sep - and one of them reached signed-in children

Both found in an admin-side sweep and handed over. Rule 5 in each case, not
Zero-Tag: Zero-Tag is diagnostic labels, learner types and modality categories,
and neither of these is one. Worth keeping straight, because the first was
nearly triaged against the wrong checklist.

**1. The bell invented a message from a named teacher.** `MOCK_NOTIFICATIONS`
held *"Ms Okafor sent you a message - Lovely work on your fractions today"*: a
fabricated message attributed to a real teacher, praising work the child may
never have done. A child could have thanked her for it.

It was not confined to the signed-out walkthrough. `NotificationProvider` had no
`useHydrated` guard, `useHasSession`'s server snapshot is hardcoded false, and
the provider is mounted in the ROOT LAYOUT - so every student page's server
markup and first client frame ran the signed-out branch for a genuinely
signed-in child. The violet unread dot rendered with nothing behind it.

**Both halves are fixed, and the second is the one that lasts.** The array is
empty, and the hydration guard means the branch cannot run before the client can
see the token, whatever anybody puts there later. The samples moved to
`lib/mocks/sampleNotifications.ts` - its own file, named `sample`, because the
repo-wide sweep grepped for "sample" and "fixture" and missed
`MOCK_NOTIFICATIONS` entirely.

**A note on testing it, because the obvious test proves nothing.** With the
array empty, the signed-out branch and the nothing-state return identical
values, so a test counting rows passes with or without the guard. Extracting the
samples is what makes the guard observable: the test mocks that module with the
original fabricated row and asserts the unhydrated branch still yields nothing,
and that the hydrated signed-out branch does take it. Removing the guard fails
two tests.

**Still open, deliberately not taken:** `NotificationBell` carries no
`SampleRegion`, and `StudentShell` mounts it outside both `MaybeSample`
wrappers, which is why the end-to-end sweep never caught this. It matters less
with an empty array and it is the thing that would have caught it, so it is
worth doing when someone is next in that shell.

**2. Fourteen invented class names on one of the first screens a school sees.**
`DEMO_CLASSES` - "Year 2 Wrens", "Year 5 Otters" - rendered whenever
`Boolean(draft.schoolCode)` was false.

Also not only the walkthrough. `getOnboardingDraft` returns `{}` both when no
school was verified AND when the sessionStorage write silently failed, which
`mergeOnboardingDraft` swallows on purpose for private mode. So a child who
typed their real school code in a private or storage-blocked browser saw
fourteen classes from a school that is not theirs, and picking one wrote
`classId: undefined` - the exact failure `pick`'s docblock claims to have fixed.
That fix keyed on `schoolCode`, and this path has no `schoolCode` to key on,
which is why the answer is no invented list rather than a better condition.

**The existing empty state was NOT reused as-is.** The verified-but-empty screen
says *"<school> is connected, but it hasn't added any classes"*, and that is
true only after a school code verified. Pointing the unverified path at it would
have swapped fourteen invented classes for one invented connection. It has its
own copy on the same layout: we do not have your school yet, here is the
class-code route - which is also the honest forward path, because sending a
storage-blocked child back to the school step is a loop.
### Slower shipped, and `slowerSteps` had been unreachable the whole time

Design split the pace control on 17 Sep rather than dropping it, and the split
was right: *"Slower I do not think is a text reshape at all. Slower is about how
much arrives at once, which is segmentation and pacing rather than wording."*

The mechanism already existed. `TextSegment`'s chunked flow - one short part at
a time behind a tap-to-continue, with a calm four-second pause - regroups
sentences the lesson already has. It was reachable only through the `attention`
accommodation. It now also serves a child picking Slower, so the control works
on live parsed content with no authored content at all. Extracted to
`lib/lessons/chunk.ts` so the renderer and the player's gate share one
definition, and the component is `ChunkedBody` rather than
`AttentionChunkedBody` because it no longer belongs to one caller.

**THE BUG UNDERNEATH IT, which is the part worth reading.** The density bar
offered a density when `segment.text.body[density]` existed. **No authored
lesson has ever declared `body.slower`** - the mocks carry `default`,
`simplify` and `expand` - so Slower was never offered on any screen in the
product, demo included. Meanwhile **seven segments across the two authored
lessons carry `slowerSteps`**, complete with lead lines and numbered cards, and
nothing could render them. The gate asked for the wrong field. This is the
"written but never read" pattern again, and the first time it has been authored
CONTENT rather than a wire field: somebody wrote three careful steps for
"Inside the leaf" and no child could ever see them. Verified on screen after
the fix - the cards render, and the authored form still wins over chunking
where it exists, because doing both makes a child read the same idea twice.

**Honest about what was verified how.** The authored path was checked in a real
browser. The chunked path only appears on live parsed content, which needs an
account this lane does not have, so it is covered by DOM tests built against a
live-shaped lesson - one body, no reshapes - and mutation-checked.

**Two rules this deliberately respects.** It never writes `segment_length`:
that accommodation is engine-owned and applied before the first screen, while a
child asking is a control, and the two are separate inputs to the same
renderer. And the chunked flow keeps reporting how much of the body was
actually shown, because a chunk always fits the column - without it, a child who
asked for less at a time would be reported to the engine as having read all of
it. Asking for help must not cost a child the accuracy of what the engine knows.

### The state vocabulary is gone from the code, 17 Sep — and one word could not go

Design ruled the rename in rather than deferring it: *"Code named for states
teaches the next person that the frontend reasons about states, and that is the
exact drift we have hit four times."* `AFFECTIVE_STATES` and `AffectiveState`
are deleted, `SegmentAdaptation.affect` is now `adjustment` in §4's own
vocabulary, `affectHint` is `hint`, and the three components are `HintOverlay`,
`DifficultyOfferPill` and `SocraticPanel`. The authored demo passes instructions
too, because a demo with a private vocabulary is how the old one survives a
rename. A test fails the build on any of the eight state words appearing in
code in the nine files that author, choose or render an instruction.

**One string stayed, and it is a backend ask.** `breakTrigger.current =
"affect_offer"` is sent to the engine as the `trigger` on a `BREAK_START`
signal, so it is wire vocabulary rather than ours to tidy — renaming it
unilaterally would change what the engine receives. It is also the only place
this app still says an affective state out loud, and it says it *to* the engine.
**The ask: is `trigger` a free-text field or does the engine key on these
values, and if it keys on them, can `affect_offer` become `instruction_offer`?**
Low urgency — `break_start` is still absent from `SignalEventType`'s 27 values
(list S-B row 2), so this event is very likely being rejected today anyway.

**One thing the rename fixed that was not cosmetic.** The break offer was gated
on `affect === FRUSTRATION` *as well as* on the plan naming a break type, so a
plan could name a break and be ignored because the frontend disagreed about
why. Rule 5 read backwards. `offerBreak` being present is the instruction now.

### The build models a state where §4 models an instruction

`SegmentAdaptation.affect` is a per-segment `AffectiveState`
(`anxiety | boredom | frustration | confusion`) and the components are named
for those states — `FrustrationHint`, `BoredomOfferPill`, `ConfusionSupport`.
§4 is explicit that the frontend never knows the state. Only the authored demo
ever sets `affect`, so nothing is currently wrong on screen, but the types
encode knowing something we are told we must not know. Worth a rename to the
instruction vocabulary when someone is next in that file; not urgent, and not
worth a churn commit on its own.
