# Demo clips — recording guide

**For:** Lydia presenting live to an intermediary, narrating over silent clips.
**Recorded against:** the live backend on the seeded tenant. Everything on screen is real.
**Shape:** nine standalone clips, ~20 minutes total. Each makes one point and stops.

Written 18 September 2026. The clip order is the pitch: a school opens, a teacher
sets up, a child is measured, a lesson adapts, the teacher sees it, the school
oversees it, a parent consents.

---

## Read this before you record anything

### 1. The fixture fallback will film a lie

`useStudentLesson` answers a 404 or a failed parse with **an authored fixture of
the same id**. `SampleRegion` renders as `display:contents`, so there is nothing
on screen to see. If a lesson fails while you are recording, you will capture the
photosynthesis fixture — richer than anything real — and the recording will look
like your best take.

**Pre-flight, on the day, in this order:**

1. Open each lesson id you plan to film, signed in as the child you will film.
2. In devtools, confirm no `SampleRegion` wrapper in the rendered tree.
3. Confirm the Network tab shows a 200 for the lesson read, not a 404 followed
   by a render.
4. Only then start recording. Re-check if you re-take after a gap — a lesson
   that was parsing when you checked may have failed since.

### 2. The one rule for Lydia's narration

The architecture is explicit, and this is the single easiest way to damage
credibility with someone who will repeat it to schools:

> A floor is a target. It has never been measured on Nevo. It must never be
> stated externally as though it has.

The defensible sentence, near enough verbatim: *the methods are validated at the
published levels, across the samples named; the combination has not been measured
by anyone, including us; a term of deployment is what produces our number.*

That is a **stronger** position than a borrowed statistic, because it is true, it
is checkable, and it is why the first cohort of schools gets the rate they get.
Two sigma is the benchmark Nevo aims at, not a result Nevo has. Say "aimed at",
never "achieves".

### 3. Do not film these

| | Why |
|---|---|
| **Admin → Overview period pill** | Nothing deployed carries a period or accepts a date filter for those five figures. Every "this half-term" number would be false. Do not film it and do not let it appear behind anything. |
| **Admin → SSO health** | The schema carries no certificate expiry. Fine internally, but do not present it as monitoring — the one predictable lockout is the thing it cannot see. |
| **Anything fixture-backed, unmarked** | Sample regions are invisible on camera. If you cannot prove a screen is live, cut the shot. |
| **A child's screen showing any result** | If a score, grade or percentage ever appears in the student app, that is a bug. Stop, do not film it, raise it. |

### 4. Pacing, because Lydia is talking over this

Every clip is silent and she is speaking across it. So:

- **Hover before you click.** A viewer needs to see the target before it changes.
- **Let each screen settle for ~2 seconds** before you move. She needs somewhere
  to land a sentence.
- **Move the cursor deliberately and slowly.** No hunting, no overshoot.
- **Never scroll fast.** Half speed of what feels natural.
- **Leave 3 seconds of stillness at the end of every clip**, so she can finish a
  thought before the cut.
- Record at 1920x1080. If you need slow-motion polish, the 0.25x capture
  pipeline in `scratchpad/demo-recorder/slowmo.mjs` already solves this — see the
  demo-video-render notes.

---

## Clip 1 — A school can open its own door

**Proves:** no sales engineer required. **~90 seconds.**

| Shot | Route | Action |
|---|---|---|
| 1 | `/landing` | Land on the page. Settle. Scroll slowly to the footer. |
| 2 | `/landing` | Hover the onboarding link, then click. |
| 3 | `/admin/onboarding` | Move through the form at reading pace. Do not submit on camera if it would create a real school — cut before submit and pick up the signed-in state in clip 8. |

**Lydia's point:** a school starts this themselves, today, without us.

---

## Clip 2 — A teacher sets up a class in a few minutes

**Proves:** setup belongs to a teacher, not to IT. **~2 minutes.**

| Shot | Route | Action |
|---|---|---|
| 1 | `/teacher/onboarding` | Step through. Pause on each screen. |
| 2 | `/teacher/classes` | Show the class list. Hover a class card — the headcount is real. |
| 3 | `/teacher/classes/[classId]` | Open one. Let the roster settle. |
| 4 | `/teacher/classes/[classId]/code` | Open the class code. **Hold this shot** — it is the hinge into clip 3. |

**Lydia's point:** one code on the board, and the class joins.

---

## Clip 3 — The system measures how a child thinks. It does not ask.

**Proves:** the core differentiator. **~4 minutes — the most important clip.**

This is the one to get right. Everything Nevo claims rests on the fact that this
is measured rather than self-reported, and that the child is never told.

| Shot | Route / component | Action |
|---|---|---|
| 1 | `/student/connect` | Enter the class code from clip 2. Type it at human speed. |
| 2 | `/student/onboarding/name` | Name and age. |
| 3 | `/student/onboarding/school` → `class` | Confirm school and class. |
| 4 | `ProfilingIntro` | **Pause here.** The framing is "setting up your learning space". Let it sit. |
| 5 | `GridSpanModule` | Play it properly. Tap grid cells in reverse sequence. Get one wrong **on purpose** — the nudge is violet, never red. That shot is worth more than a correct run. |
| 6 | `SentenceDotModule` | Sentence verification and dot arrays. Note the West African names and settings — that is deliberate, not decoration. |
| 7 | `PatternFlankerModule` | The attention task. |
| 8 | `DomainProbeModule` | Prior knowledge. |
| 9 | `QuestMap` | The four-segment map filling. **This is the only progress cue a child ever sees.** |
| 10 | `StretchInterstitial` | Brief. |
| 11 | `YoureInScreen` | "Nevo is ready for you." Hold for 3 seconds. |

**Film the absences too.** Slow the cursor near the top of the screen so a viewer
can see there is no timer, no score, no attempt counter, no back button, no skip.
Lydia should name each one as it fails to appear.

**Lydia's points:**
- Six dimensions, measured through public paradigms — Corsi span, flanker,
  sentence verification, dot comparison — not a preference survey.
- The words *test*, *score* and *ability* never appear. No result is ever shown.
- The motor baseline step subtracts touchscreen latency, so a child unfamiliar
  with a tablet is not measured as slow. That is the difference between measuring
  a mind and measuring a household's income — and it is the line that lands
  hardest with a school serving mixed intakes.
- **Nothing here produces a category.** It produces numbers that configure
  software.

---

## Clip 4 — A lesson adapting, while you watch

**Proves:** the central claim. **~4 minutes.**

Pre-flight this lesson id specifically. Text, visual and audio render from real
parsed content; interactive and calculation do not yet, so **script around a
lesson whose segments are text, visual and audio.**

| Shot | Component | Action |
|---|---|---|
| 1 | `/student/lessons` | The child's lesson list. |
| 2 | `LessonPlayer` | Open a lesson. Let the first screen render. **Do not skip this beat** — the accommodations are already applied. There is no un-adapted first screen to show, and that absence is the point. |
| 3 | `TextSegment` | Read at a child's pace. |
| 4 | `ModalitySuggestionPill` | When it appears, hover it, pause, then take it. |
| 5 | `VisualSegment` / `AudioSegment` | The same segment, the other way in. **Same concept, same objective, same assessment.** |
| 6 | `ScaffoldIndicator` | Get a question wrong. Let the circles fill. **Do not point at it with the cursor** — it is meant to be ambient. Lydia names it; the shot does not chase it. |
| 7 | `ModuleBoundaryScreen` | "Module 2 of 4". Hold it. No confetti, no points, no sound. |
| 8 | `BreakOfferPill` → `BreakScreen` | If it fires, film it. If it does not, do not force it. |
| 9 | `LessonComplete` | Quiet completion. Hold 3 seconds. |

**Lydia's points:**
- The switch is between two ways into the *same* segment. The child does not
  carry a modality, and nothing about that choice is stored.
- **This is where to kill the learning-styles objection.** Any school that has
  read anything will assume this is visual/auditory learner matching. It is the
  opposite: that idea is the most thoroughly disproven in education science, and
  we removed the preference survey permanently because of it. A competitor
  profiles children into categories. We respond to the moment.
- Support arrives as part of the lesson, never as a correction. That is the only
  reason a struggling child can be helped in a room full of peers without being
  exposed.
- No reward mechanics anywhere. That is a decision about what relationship a
  child has with the product, not a missing feature.

---

## Clip 5 — It recalibrates, daily

**Proves:** not one-and-done. **~45 seconds.**

| Shot | Route | Action |
|---|---|---|
| 1 | `/student/warm-up` | The ~45-second warm-up. `WarmUpCard` → `WarmUpRun`. |

**Lydia's point:** one dimension a day, rotating through all six across a week.
Same activities, stripped to a single round, no quest map. Never a test, never a
score. A child in September is not the child they are in March.

---

## Clip 6 — What the teacher sees, and what she never sees

**Proves:** actionable signal without a label. **~3 minutes.**

| Shot | Route | Action |
|---|---|---|
| 1 | `/teacher/dashboard` | Settle. |
| 2 | `/teacher/insights` | Class-level narrative. Which concept is settling slowly across the class. |
| 3 | `/teacher/students` | The roster. |
| 4 | `/teacher/students/[studentId]` | One child. **Slow down here.** |
| 5 | same | Scroll the whole panel deliberately, so a viewer can see what is absent. |
| 6 | `/teacher/students/[studentId]/recommend` | Recommend a lesson, with a note. |

**Lydia's points:**
- Every line describes what the software did, never what the child is. "Finishing
  the lessons she starts" is an observation. "Struggles with retention" is a
  finding we have no grounds for, and it does not exist anywhere in the product.
- No ranking. No percentile. No class league table.
- Help-seeking is aggregate only, never per-question, and nothing appears below
  three interactions — because a visible log of asking for help chills exactly
  the children who most need to ask. **And the child is told that**, in the Ask
  Nevo drawer.
- A teacher can act on this. Nobody can label a child with it.

---

## Clip 7 — Their curriculum, not ours

**Proves:** it adapts the teacher's own lesson. **~2 minutes.**

This is the objection-killer for a school that already has schemes of work.

| Shot | Route | Action |
|---|---|---|
| 1 | `/teacher/lessons` | The library. |
| 2 | `/teacher/lessons/upload` | Upload a real lesson. Film the parse progressing. |
| 3 | `/teacher/lessons/[lessonId]` | The parsed result. |
| 4 | `/teacher/lessons/[lessonId]/variants` | **The money shot** — the same lesson, multiple ways in. |
| 5 | `/teacher/lessons/assign` | Assign it to a class. |

**Lydia's point:** we do not replace what a teacher wrote. The concept, the
objective and the curriculum are identical for every child in the class. What
changes is the route through it.

---

## Clip 8 — The school's view, and the thing nobody else can say

**Proves:** oversight, and Zero-Tag. **~3 minutes.**

| Shot | Route | Action |
|---|---|---|
| 1 | `/admin/dashboard` | Overview. **Avoid the period pill entirely.** |
| 2 | `/admin/students` | Roster with consent states. |
| 3 | `/admin/classes` | Classes. |
| 4 | `/admin/senco` | Learning support. Then `/admin/senco/[studentId]`. |
| 5 | `/admin/compliance` | **Hold the longest shot of the clip here.** |
| 6 | `/admin/reports` | Close out. |

**Lydia's points:**
- The database stores `visual_scaffold_density = 0.8`. It never stores anything
  resembling a description of a person. No category, no type, no diagnosis,
  anywhere.
- Enforced three ways: built correctly, guarded by middleware that rejects any
  write containing diagnostic vocabulary, and never written into copy.
- **This is the commercial argument as much as the ethical one.** Our nearest
  competitor profiles children into categories and routes them elsewhere. If we
  categorised, we would be a worse version of them. We do not, and the filings
  say so.

---

## Clip 9 — The guardian is in the loop

**Proves:** NDPA position is real, not a checkbox. **~90 seconds.**

| Shot | Route | Action |
|---|---|---|
| 1 | `/admin/students` | Trigger a parent consent request. |
| 2 | `/parent/[token]` | The consent screen as a guardian sees it. |
| 3 | `/parent-portal` | What a parent can see about their own child. |

**Lydia's point:** consent is recorded with version, accepting person and
timestamp. A guardian who withdraws stops measurement — and that path is built,
not promised.

---

## If a clip goes wrong on the day

- **A screen is empty.** Do not film it and do not narrate around it. Cut the
  shot; an empty state in a sales clip costs more than a missing feature.
- **A lesson 404s.** Stop. You are now filming a fixture. Re-run pre-flight.
- **A number looks wrong.** Do not film it. A wrong figure in front of an
  intermediary gets repeated to a school.
- **Something shows a child a result.** Stop, cut, and raise it — that is a
  rule-9 breach and it is a bug, not a demo problem.

---

## Open, and worth knowing before the day

- `POST /api/v1/students` has returned 500 on valid input since 8 September, so
  the tenant cannot be seeded by script. Anything you need on screen has to be
  driven through the join flow by hand. Budget for that.
- Interactive and calculation segments do not render from parsed content yet
  (`RENDERABLE` is text, visual, audio). The co-construction mechanic is the one
  thing in the six that clip 4 cannot show. If Lydia wants to speak to it, she
  should describe it rather than promise a screen.
- Run `node scripts/admin-probe.mjs` before scripting the admin clips, so shot
  lists match what the tenant actually holds.
