# Design rulings, 23 September 2026 — and what goes back

Design answered the 23 Sep asks in full. This file records what was settled, so
the next reader does not re-open any of it, and states the two things that come
back — one of them the "bigger finding" design asked to be told about.

---

## 1. What comes back to design

### 1a. THE ENGINE HAS ONE INSTRUCTION CHANNEL, NOT TWO

Design's instruction: *"Density dropping belongs to the affective channel, not
to pace instructions, and those were designed as two separate systems. Confirm
whether the engine exposes affective state separately before anyone deletes a
shipped treatment. If it does not, that is a bigger finding than this ticket and
it comes back to me."*

**Confirmed against the deployed spec (225 paths, 406 schemas): it does not.**

Nothing in 406 schemas names `affect`, `emotion`, `frustration`, `boredom`,
`anxiety`, `confusion` or `engagement`. `AdaptResponse` carries exactly three
channels and no state:

| channel | what it carries |
|---|---|
| `proactiveAdjustment` | `action`, `reason`, `confidence`, `triggerSignals`, `hint`, `guidedQuestions` |
| `breakSuggestion` | `triggeredThresholds`, `severity`, `breakType`, `reason` |
| `modalitySuggestion` | `suggested`, `triggerReason`, `confidence`, `adaptationConfidence`, `triggerSignals` |

**But the absence of a STATE is the architecture working, not a gap**, and this
codebase has already drawn the wrong conclusion from this exact search once
(17 Sep, recorded in `S-B` row 1). Frontend §4: the frontend receives an
instruction and never knows which state is active. So "affective state" is not
something to look for.

**The real finding is narrower and sharper.** `proactiveAdjustment` IS the
affective channel — `offer_hint` and `show_socratic_panel` are the affective
responses and they live there, in the same five-value enum as `simplify`,
`slower` and `expand`. **There are not two systems on the wire. There is one
list, mixing what design calls pace with what design calls affect**, and
`modulate_density` is not in it.

So density dropping has no channel it could arrive on other than
`ProactiveAction`, and it is absent from that. Nothing is being deleted on a
guess — but nothing can be triggered either.

### 1b. THE BREAK ALREADY HAS ITS OWN SIGNAL — no ask needed

Design's instruction: *"It needs its own signal from the engine. Raise it with
Teslim as a request rather than trying to fold it into the instruction list."*

**It already has one, and we already read it.** `AdaptResponse.breakSuggestion`
is a separate required field — `{triggeredThresholds, severity, breakType,
reason}` — consumed by `useRuntimeAdaptation` as `offeredBreak`, and
`LessonPlayer` has carried the note *"`offer_break` has its own richer seam
through `breakSuggestion`"* since the affective work landed on 17 Sep.

Design's reasoning for why it is a different kind of thing is exactly right, and
the wire already agrees with it: the break is not in `ProactiveAction` because
it is not an adaptation instruction. **No request to Teslim is needed. The
concern that `offer_break` "can never fire" was mine and it was wrong** — the
dead constant is `ADJUSTMENT_ACTIONS.OFFER_BREAK`, which nothing needs, not the
break itself.

---

## 2. What is settled, and now buildable

### 2a. `simplify` is the Simplify control. **Unblocked.**

*"One is asked for by the child, one is decided by the engine, and what happens
on screen is identical. Build it as a single path with two callers."*

**Simplify is no longer blocked on `textVariant`**, and the frozen row can be
struck. The `textVariant` question remains open on its own merits — what it is
relative to `segment.body`, and whether the teacher approves text no child
reads — but Simplify does not wait on it.

### 2b. A returning child on a PIN is **held**. `S-C`/consent.

*"The gate is on the child's consent state, not on the route they arrived by.
Every entry path resolves consent before anything mounts, and PIN sign-in is an
entry path."*

This closes the half deliberately left unbuilt on 23 Sep (PR #506).

**ONE DISTINCTION STILL UNRULED, and it is the parent lane's question rather
than this one.** This ruling is about ENTRY. It does not say whether a child
already signed in and inside the app is stopped from opening a lesson — which is
what `students/me/consent-gate`'s `blocked` and `admin/D25` PC-03 (*"a child
stays out of lessons until they're cleared"*) are about, and what the 7 Sep
SCRUM-80 ruling said the opposite of. Entry is ruled; mid-session is not.

### 2c. The age check is 00d. Same screen, same words, different state.

*"The child is not told why... A disputed date of birth is two adults
disagreeing with each other. Telling a child that invites them to go and resolve
it, which is the one thing that must never happen, and it makes a child the
arbiter between their parent and their school."*

The adults are told in full on the administrator's surface. So `ageCheckPending`
routes to the same screen as `consentState: "pending"`, and nothing on it
differs.

### 2d. Nothing announces a scaffold change. **Confirmed as built.**

*"No toast, no message, no 'we have made this easier'. The scaffold indicator is
the only surface it appears on and it carries no words."*

**And `studentMessage` has its ruling:** *"It appears only as the content of
something the child asked for, which is a hint they requested, an Ask Nevo
reply, or the socratic panel. It never appears unsolicited, never refers to
difficulty, easier, harder, or how the child is doing."*

A scaffold decision arrives unsolicited, so **`ScaffoldDecisionResponse.studentMessage`
is never rendered** — which is how PR #508 built it. Confirmed rather than
changed.

### 2e. The teacher's note **reaches the child**. `S-A 5` / `S-C 11` unblocked.

*"It appears on the lesson screen, attributed to the teacher by name, drawn so
it is unmistakably a person's words rather than Nevo's. It never enters anything
Nevo generates about that child, and it is never rewritten, summarised or
adapted."*

Not the `highlights` ruling after all, and the reason the distinction was worth
asking about is the reason it went the other way.

### 2f. The four manipulative kinds: **emit them.** `S-C 13`.

*"Draw them once as a shared set rather than per lesson, because they are
representations of a concept rather than decoration for a question."*

Still waiting on the shared set before `number_line`, `array`, `place_value` and
`counters` can be drawn — the ruling is that they are coming, not that they are
here. The current refusal stands until they arrive.

### 2g. Smaller ones

| item | ruling |
|---|---|
| Daily warm-up done state | **Yes.** Says nothing about performance; closes and moves the child into the day's lesson |
| `invalid_session` | **Gets its own words.** Nothing-landed and a dead link are different problems with different next actions — same copy sends a child to try something that cannot work. *Copy not yet supplied* |
| Demo walkthrough by URL | **Reachable.** Design needs to be able to send it |
| QR scanning | **Deferred** |
| Calculation scaffold beyond two like fractions | **A real gap**, on the list. *"It will break the first time a teacher uploads a normal lesson."* Not this week |
| A system voice for six-year-olds | **Out of scope** — see below |

---

## 3. THE LARGEST THING IN THIS MESSAGE IS ONE CLAUSE

*"We are narrowing to secondary for launch, which takes the youngest band and
everything audio-led with it."*

That is a product scope change, it arrived as the justification for closing a
minor item, and it reaches much further than the item it closed. Recorded here
rather than acted on, because it needs its own conversation:

- **The baseline is built for four bands** — `p13`, `p46`, `jss`, `ss`. Secondary
  is `jss` and `ss`. Every run is built for a band and `run_start` carries it.
  Which bands remain is a question about the baseline, the probe item set and
  SCRUM-176's count, not only about a voice.
- **Audio is a modality, not a feature.** `MODALITY.AUDIO` is one of the
  channels the multi-modality system switches between, and §5 requires a minimum
  of two per segment. `narration_played` and `narration_replayed` are in
  `SignalEventType`. Removing audio-led content is not the same as removing
  narration, and which is meant matters.
- **The modality suggestion pill** is already structurally unreachable because
  visual generation is failing library-wide. If audio also goes, it is worth
  knowing what is left to switch between.

**Nothing has been changed on the strength of that clause.**
