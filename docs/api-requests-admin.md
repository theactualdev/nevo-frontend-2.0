# Three shapes, as asked — 15 September 2026

You asked for the four Settings sections, what assignment history contains, and
what SENCo active support returns. Here they are.

These were drafted and then adversarially reviewed against the deployed
document; the review killed a fair amount, including one draft that inverted a
locked SCRUM-99 ruling. What follows is what survived.

**Send-order suggestion, cheapest first:** SENCo active support → assignment
history → Settings part one → Settings part two (needs design first).

---

## 0 · Two corrections back to us first

**The profile avatar is already built and we simply are not consuming it.**
`POST /api/v1/users/me/profile-photo` exists and `ProfilePatch.profileImageUrl`
exists; nothing in our tree touches either. Our gap, not yours — struck from
the Settings ask below.

**Two things from today's six that are worth a line in the schema**, in the same
spirit as documenting `vatRate` so the question cannot come round a third time:

1. **The consent 403s are invisible to the contract.** The four processing
   endpoints declare only their success code and 422, and `consent_withdrawn`
   appears **zero times** in the whole document. The enforcement is yours and I
   believe it works — but a generated client cannot see it, our contract-check
   cannot see it, and nothing tells the next person that a 403 from
   `POST /lessons/{id}/session` means "show the account-on-pause screen" rather
   than "you lack permission". One `403` response with the error code in its
   description would fix that permanently.
2. **`LessonDetailResponse` calls it `recap`; the student player reads
   `lesson.summary`.** Both fields are optional, so nothing throws — the
   "See summary" affordance just never appears. That is the student session's
   to wire, and they should know the name differs before they go looking for a
   field that is not coming.

---

## 1 · SENCo active support

The last of D8b's three per-learner figures. The other two are built. This one
still costs one call per learner, because
`GET /api/intelligence/accommodations/{student_id}` takes no student list — at
247 profiles that is 247 requests to paint a list, which is why it is not built.

### `GET /api/intelligence/accommodations` — a collection sibling

School-scoped by token. The item route and `AccommodationAnalysisResponse` do
not change.

**Mirror `GET /api/v1/students`, not `/api/intelligence/flags`.** That read
already fetches this same population for this same screen and is **unpaged** —
bare array, no limit, no offset. Three fields across 247 rows is a few KB, and
the cost here is per-learner analysis, which paging multiplies into five round
trips rather than reducing. Mirroring it kills the ordering, envelope and header
questions at once.

*If you would rather page it,* then two things become MUST: a documented stable
order (`studentId` ascending is enough) and a **body** envelope
`{ profiles, total, limit, offset, hasMore }` — which invents nothing,
`{items,total,limit,offset}` is already `AdaptationEventLogResponse` and
`ParentRightLogResponse`, and `hasMore` is already on
`NotificationListResponse`. Headers would need a `responses.200.headers`
declaration plus a proxy-allowlist and client change, so please price that
before choosing them.

**Row — three fields:**

| field | type | required | for |
|---|---|---|---|
| `studentId` | uuid | ✅ | join key; matches `StudentSummaryResponse.id` |
| `activeAccommodations` | `AccommodationType[]` | ✅, `[]` never null | the list figure. Same name and same existing enum as `AccommodationAnalysisResponse` |
| `status` | `observed \| not_observed_yet` | ✅ | see below |

**`classId`** as an optional query param is NICE TO HAVE only — D8b filters
client-side from a class map it already holds, and the default view needs the
whole school anyway.

**On `status`, honestly:** it duplicates `ClassStudentResponse.profileStatus`,
which we already receive per class. We want it here anyway for two reasons — a
learner in **no class** never appears on any roster read, and a class roster
read can **fail on its own** (the screen already tracks that), in which case the
roster's answer is missing exactly when we need it. If that is not worth a
column to you, drop it and we will take `profileStatus` and accept those two
gaps.

**What we are NOT asking for, and why.** No severity, no rationale, no
free-text, no scores, no engine parameters, no "needs" of any kind. An
accommodation is what Nevo is *doing* for a learner, which is permitted. Any
field describing what the learner *is* would be a diagnostic label about a
child, and this console must never hold one. The list figure D8b draws is a
count and a short label, nothing more.

---

## 2 · Assignment history

SCRUM-40, verbatim: *"Assignment history is a collapsed section on both class
and teacher detail: date, teacher, class, role, and who made the change. Plain
rows, monospace dates. Read-only."* Its done-criterion requires the log to be
**append-only** and to **show who made each change**.

**What already works:** `AssignedTeacherResponse` and `AssignedClassResponse`
both carry `role` and `assigned_at`, so a dated *current*-assignment list is
built and shipping. What is missing is an **actor** and **endings**.

### `GET /api/v1/teacher-class-assignments/history?classId=&teacherId=&limit=&offset=`

**Not `assignments/history`**, which SCRUM-40's data line suggests:
`/api/v1/assignments` is the learning-product lesson-assignment resource and
would collide. This belongs on the teacher-class-assignments router.

Query params **camelCase** to match every other filter endpoint including
`/consents/rights-log`, whose envelope this copies. The response **body stays
snake_case** to match `AssignedTeacherResponse` in the same router. Both are
deliberate; neither should be normalised into the other later.

**One row per EVENT, not per span** — that is what append-only means, and it is
how a removal "writes a history row; it never edits the old record."

| field | type | required | notes |
|---|---|---|---|
| `id` | uuid | ✅ | |
| `assignment_id` | uuid | ✅ | ties the pair of events together |
| `event` | `assigned \| role_changed \| ended` | ✅ | new enum — `AssignmentStatus` is the lesson lane's and would collide |
| `occurred_at` | date-time | ✅ | |
| `class_id` | uuid | ✅ | |
| `class_name_at_time` | string | ✅ | non-null on `AssignedClassResponse`, so no mismatch |
| `teacher_id` | uuid | ✅ | the row's subject |
| `teacher_first_name_at_time` | string \| null | ✅ key | |
| `teacher_last_name_at_time` | string \| null | ✅ key | |
| `teacher_email_at_time` | string \| null | ✅ key | |
| `role` | `TeacherAssignmentRole` | ✅ | existing enum |
| `actor_id` | uuid \| null | ✅ key | |
| `actor_name_at_time` | string \| null | ✅ key | |
| `actor_kind` | `person \| roster_sync \| system` | ✅ | see below |
| `actor_recorded` | boolean | ✅ | why a name is null |

**Names are snapshots.** SCRUM-40: *"Renaming a class does not alter history:
assignment records keep the name they carried at the time."* The three teacher
name fields mirror `AssignedTeacherResponse` exactly so the history row runs the
same first+last → email → fallback the rows above it already run, and the same
teacher never renders two ways on one screen.

**`actor_kind` exists because a roster sync is not a person.** You already have
a `roster-sync` assignment endpoint, and "who made this change" has no honest
answer for it. `roster_sync` lets the row say *"by the Microsoft directory
sync"* rather than inventing a name or leaving a blank that reads as missing
data.

**No backfill.** Instead, one envelope field:

| field | type | required | for |
|---|---|---|---|
| `history_begins_at` | date-time | ✅ | when this log started recording |

The section then renders *"This record starts 15 September 2026"* beneath the
rows, and SCRUM-40's empty state *"No changes yet."* becomes a **true**
statement rather than a claim that nothing ever happened. This deletes a
migration and stops the API asserting events nobody observed.

---

## 3 · The four Settings sections — **part one only**

Part two needs design answers before it is worth your time. Sending what is
ready.

### 3a · Role title — one nullable column

`ProfilePatch` gains `roleTitle: string | null`, and `CurrentUserResponse`
returns it. **Name it `roleTitle`, camelCase**, matching the `profileImageUrl`
precedent on that same schema — `CurrentUserResponse` is otherwise snake_case,
so without saying this you will reasonably ship `role_title` and the console
will read `undefined`.

### 3b · Type the `profile` blob

Same treatment you just gave `academicConfig`, for the same reason. The console
invented `contactEmail`, `contactPhone` and `location`, and nothing validates
them. While you are there, the remaining `academicConfig` keys we invented —
`yearStart`, `yearEnd`, `terms`, `yearGroupLabels`, `taxonomyPreset` — want the
same, and the calendar ones matter twice over because your own promotion logic
will need those dates.

### 3c · School address

`PostalAddress`, extracted from the one already inside `BillingContactRequest`
rather than a second shape. Keep `region`.

Justified on the **DPA**, not on invoicing — `BillingContactRequest` already
carries a full invoicing address written from D11b. Please say which is the
address of record if they can differ.

### 3d · Email change — a pair, not a PATCH

Email is an authentication identifier, so a silent `PATCH` is wrong.

- `POST /api/v1/users/me/email-change/request` — `{ newEmail, currentPassword? }`
- `POST /api/v1/users/me/email-change/complete` — `{ token }`, **unauthenticated**
  (`security: []`, exactly like `password-reset/complete`), returning a plain
  receipt rather than `CurrentUserResponse`; the console refetches `/users/me`.
- `CurrentUserResponse` gains `pendingEmail: string | null`, so the screen can
  say *"waiting for you to confirm from that address"* rather than showing the
  old address as though nothing is happening.

`currentPassword` must be optional or absent for SSO accounts — either tell us
how the server identifies one, or accept step-up through the existing
`POST /api/v1/admin/sso/reauthorise`.

### 3e · Cut from this round

- **The logo.** D12 draws none and says *"no white-label controls in v1"*, while
  SCRUM-99's ticket says the logo appears on student and teacher surfaces. That
  is design's to settle before you build an upload endpoint.
- **Language.** Nothing is written at all — D12c renders it as explanatory copy
  (*"English is the only language available today"*). No endpoint needed.

### 3f · Part two — held, and what it needs

**Two-step sign-in (D12.8)** and **promotion (D12.4b)** both need design
answers first.

One thing to fix in advance, because our own draft got it wrong: promotion's
**leaving cohort defaults to KEEP ACTIVE, not deactivate.** SCRUM-99 settled it
on 26 July — *"Leaving cohort at promotion: never automatic… Default is keep
active. Admin decides."* Our draft proposed the opposite and attributed it to
design; it was wrong, and I would rather tell you that than have you build it.

When it comes, promotion needs a **preview → commit** pair where the commit
quotes a `previewId` that doubles as the idempotency key, a `202` returning the
`{runId, status, pollUrl}` shape you already use for roster sync, and a
server-owned `undoAvailableUntil` — the seven days must not be a client-side
`committedAt + 7`, because that is how a screen promises an undo the server has
already dropped.

And the "why can't this student be promoted" reasons must be an **enum**, never
free text — for the same reason you left `reasonRecorded` out of the rights log.
"Repeating this year at his parents' request" is a family circumstance about a
named child in front of every admin who opens the page.

---

# Addendum — 16 September 2026: what is still open

Re-verified this morning against the deployed document (v2.0.0, 188 paths, 343
schemas), fetched fresh rather than read from the copy above. Nothing here is
new work for you except §5; the rest is the 15 September ask, still open, with
today's evidence attached so you do not have to re-derive it.

## 4 · One of these is CLOSED, and our own notes did not know

**`GET /api/admin/adaptation-log?eventType=` shipped.** The endpoint now takes
`classId`, `studentId`, `lessonId`, `eventType`, `dateFrom`, `dateTo`, `limit`
and `offset`. We consume it — `schoolIntelligence.ts:107` types the filter and
`AdaptationLogView.tsx:189` sends it. Thank you.

**`academicConfig` is half closed.** `termStartDates` is a validated schema
field now, so a mistyped term date is a 422 rather than an invoice on a date
the school never chose. That was the half that mattered. The other half is
below in §6.

Both of these sat in our own `BUILD_STATUS.md` under "blocked on backend, NOT
buildable at any velocity" until today, after they had shipped and after we
had consumed them. **That is our defect, not yours** — recorded here so the
next person to read that table treats it as a claim to check rather than a
fact.

## 5 · ~~NEW — the SSO signing certificate~~ **DELIVERED. Closed 21 Sep.**

**You built it and we did not notice for a day.** It shipped as
`credentialExpiresAt`, `credentialExpiresInDays` and `credentialExpiringSoon`
on `SsoConnectionHealthResponse` — a better answer than the one asked for,
because `credentialExpiringSoon` puts the judgement of "soon" on the side that
knows the provider's renewal behaviour, rather than leaving us to pick a number.
All three are now read, and the IT-home row is gated on the boolean.

**The ask is left below unedited, because how we missed it is worth more than
the ask.** We named the field `certificateExpiresAt`. You named it
`credential…`. Every re-check we ran grepped for "certificate" — our word, not
yours — and reported the row still open. If you deliver something under a name
other than the one we proposed, **say so in the reply**; we will not find it
otherwise, and this one was our top-priority pre-launch row.

D17's IT home draws *"SSO signing certificate renews in 40 days"*. **No
certificate or expiry field exists anywhere in the contract.** The only
`expiry*` fields belong to payment cards; every other `expiresAt` is a token or
an invitation. `SsoConnectionHealthResponse` carries `connectionCheckedAt`,
`reauthorisedAt`, `lastSuccessfulSyncAt`, `nextScheduledSyncAt`,
`disconnectedAt` and `lastConnectionError` — every date about the connection
except the one that ends it.

### `SsoConnectionHealthResponse.certificateExpiresAt: string | null`

An ISO date-time, null when the provider does not expose one or the connection
is disconnected. Nothing else changes, and the card is then a subtraction from
`connectionCheckedAt` on our side.

**Why this is worth a field rather than a ticket.** A signing certificate
lapsing does not degrade SSO, it stops it: every teacher and every student at
that school is locked out on one morning, with nothing in the console having
said it was coming. We have `lastConnectionError` to tell them afterwards and
nothing to tell them before. It is the one lockout in this product that is
entirely predictable and currently invisible.

**Null is genuinely fine.** The card is absent rather than wrong when the field
is null — the same position we took on the provider count, where
`GET /admin/sso/status` returning one connection is the data model saying one
per school, so the card names the provider rather than counting to two.

## 6 · Still open, unchanged, with today's evidence

Ordered as before, cheapest first. Section numbers refer to the body above.

| ask | §  | re-verified 16 Sep |
| --- | -- | ------------------ |
| SENCo active support — a collection sibling for accommodations | 1 | `GET /api/intelligence/accommodations/{student_id}` is still the only route on that resource. 247 profiles is still 247 requests to paint one list, which is why it is still not built. |
| Assignment history | 2 | `TeacherAssignmentResponse` is `{id, schoolId, teacherId, classId, role, source, assignedAt}` — no actor. `DELETE /api/v1/teacher-class-assignments/{id}` still returns no body and nothing in the schema set carries `endedAt`. The dates shipped; the history still cannot. |
| Settings part one — role title, typed `profile`, school address, email-change pair | 3a–3d | `roleTitle` appears in zero schemas. `CurrentUserResponse` is `{userId, role, firstName, lastName, displayName, email, school, subjects, profileImageUrl}` — no `pendingEmail`. `SchoolPatch.profile` is still an untyped object. |
| Settings part two — two-step sign-in, promotion | 3f | Held on design, as agreed. No endpoint exists for either and none should be built until the questions in 3f are answered. |
| `academicConfig.yearGroupLabels` | — | New half of an old row. `additionalProperties: true` means the labels pass through unvalidated, so the map the whole product reads through `yearGroupLabel` is a **client-owned provisional contract** — the third in this codebase. Money and dates have been lifted out of that position; the labels have not. Lower priority than everything above it, and worth settling before launch rather than after. |

**Send order unchanged:** SENCo active support → assignment history → Settings
part one. §5 slots in wherever an SSO change is cheapest for you; it is one
nullable field and it prevents a whole-school lockout, which is a better ratio
than anything else on this page.

---

# Addendum 2 — 16 September 2026: eleven we never sent you, three of which matter now

The list above was not just stale, it was **incomplete**. A lane-by-lane probe of
the deployed document (v2.0.0, 188 paths, 343 schemas, fetched fresh) found that
every admin lane has at least one contract-blocked state that had never been
written down anywhere — including an entire screen and one bug that loses data.

None of this is new work you were asked for and deprioritised. It is work nobody
told you about, because our own blocked list had four rows on it and stopped.

---

## ~~READ THIS FIRST — only three of the fifteen are pre-launch~~ **ONE, as of 22 Sep**

**Two of the three shipped on 21 September and are built.** The signing-credential
expiry (§5) and the IEP shares read (§7b) are closed. What remains of the
pre-launch list is §7a, the term cap — and that one is **no longer waiting on
delivery, it is waiting on a decision**, because you are refusing it on billing
grounds.

That refusal is a legitimate answer and we are not asking you to reverse it. We
are asking you to pick either of the two outcomes the frontend can handle, since
the one it cannot is the one currently deployed:

> Raise the cap, **or** return a 422 and we pull the "Add a term" control the
> same day. **Silent truncation is the only outcome we cannot absorb** — a
> four-term school loses its fourth term start with no error, and is then
> invoiced on a calendar it did not choose.

If billing is the reason the cap cannot move, then 422 is the answer and it
costs you less than raising it. Everything below this line predates that and is
left unedited.

---

## READ THIS FIRST — only three of the fifteen are pre-launch

Everything we have sent you across both addenda arrived carrying equal weight,
which is our fault and makes your triage impossible. **Fifteen open asks. Three
are pre-launch. The other twelve are v1.5 and we are not asking for them before
launch** — they are written down so nobody re-derives them, not so they queue.

**The three, and they are all small:**

| # | ask | why it cannot wait | size |
|---|---|---|---|
| 1 | **`SsoConnectionHealthResponse.certificateExpiresAt: string \| null`** (Addendum 1 §5) | A lapsed signing certificate does not degrade SSO, it **stops** it — every teacher and child at that school locked out on one morning, with nothing having said it was coming. The only fully predictable lockout in the product, and currently invisible to us. | one nullable field |
| 2 | **`GET /api/v1/exports/iep/{export_id}/shares`** (§7b) | **Safety.** A SENCo cannot tell whether a child's SEN report already reached a guardian, so the screen can neither confirm a send nor prevent a second disclosure. The record is already written by your own `POST`; nothing reads it back. | no new schema |
| 3 | **Raise `AcademicConfig.termStartDates`' `maxItems: 3`, or 422 on the fourth** (§7a) | Loses data whenever a four-term school configures its year: the fourth term start is silently discarded and the school is then invoiced on a calendar it never chose. Silent truncation is the only outcome we cannot handle on our side. | one constraint |

**Suggested order is exactly that order.** If only one lands before launch, make
it **#1**.

**That ordering changed on 17 Sep, and the reasoning is worth keeping.** The term
cap was #1 on the grounds that it is the only one actively destroying something a
school typed — which is true, and it lost the argument to a fact: **no four-term
school is onboarded yet.** So the cap is damaging nobody today, while the
certificate is the one failure here that is *invisible until the morning it
happens* — a whole school unable to sign in, with no warning anywhere in the
product, most likely on a Monday in January to our first paying customer.

The general rule that produced the swap: **a quiet loss you can still discover
ranks below a silent one you cannot see coming.** If a four-term school is
onboarded before this lands, #3 moves back to #1 the same day.

**Explicitly NOT asking for before launch:** D09 Reports, IEP/profile PDF routes,
notification `category`, compliance erasure and subprocessors, the D19 invitation
fields, the join-link name, parent consent for invited students, the Overview
period filter, SENCo active support, assignment history, Settings part one, and
`academicConfig.yearGroupLabels`. All real. None urgent. Several are one field.

**One correction on our side while we are here:** we previously implied the DPA
document text was a backend gap. It is not — the blocker is our counsel returning
final wording, and `lib/mocks/dpa.ts` says so in its own `TODO(legal)`. SCRUM-39's
`GET dpa {version, html}` is worth having as drift protection so the words and the
stored version cannot diverge, but it is **pointless before the final copy exists**
and should land alongside it rather than now.

## 7 · The two that should jump the queue

**7a · `AcademicConfig.termStartDates` has `maxItems: 3`, and it loses data.**

**Underneath this is a product disagreement, not a schema nit.** Your field
description reads *"Nigerian schools run three terms, so send three; fewer means
Nevo falls back to splitting the contract year evenly."* SCRUM-99 says otherwise
and calls a fourth term *"a quiet action for schools running four terms"* —
`SchoolSettings.tsx:508` renders that "Add a term" control today.

So one of us is wrong about the customer, and the current behaviour is the worst
resolution of that: the screen accepts a fourth term start and the contract
**silently drops it** — no 422, no warning — and the school is then invoiced on a
calendar it did not choose. `academicCalendar.ts:120-128` carries the TODO.

This is a different and worse problem than `yearGroupLabels` in §6: that one goes
unvalidated, this one **discards a value the user typed**. Either answer is fine
and we will follow it — **raise the cap, or return a 422 so the screen can say
why and we pull the control.** Silently truncating is the only option that cannot
be handled on our side.

**7b · Nothing reads back whether an IEP export was shared.**

`IepExportShareResponse` exists as a schema, but the only deployed operation is
`POST /api/v1/exports/iep/{export_id}/share`. There is no GET, and
`GET /api/v1/exports/iep/{export_id}` returns `IepExportResponse`, which carries
no shares.

So on reload a SENCo cannot tell whether a child's IEP already reached a
guardian. The screen can neither confirm a send nor prevent a duplicate one, on
a document about a named child's special educational needs. **This is a safety
row, not a convenience one.**

### ~~`GET /api/v1/exports/iep/{export_id}/shares`~~ **DELIVERED 21 SEP. Thank you.**

It landed exactly as asked — the existing `IepExportShareResponse` rows, no new
schema, no new shape. Built on 22 Sep.

One thing the build surfaced that is worth you knowing, because it changed how
the screen reads: **`status: "revoked"` carries more weight than we expected.**
A revoked share is a guardian who NO LONGER holds a child's SEN report, so it
renders as its own sentence rather than a greyed variant of "shared with" —
those two must not look alike on a screen a SENCo scans before a meeting.

**One ask follows from it:** `sharedByName` on `IepExportShareResponse`. The
record names the sharer as `sharedByUserId` and nothing resolves a user id to a
name, so the history can say **when** and **to whom** but never **by whom** —
on a record of who has seen a child's SEN report. It is the same ask as
`reviewedByName` on `IepExport` (§6) and they should probably land together.

## 8 · D09 Reports — an entire screen with no contract

**Zero** of 343 schemas match `/report/`, and the only report path among 188 is
`GET /api/admin/compliance-audit/report.pdf`. `/admin/reports` currently serves
D20 Cohort Analytics instead, so D09 has no route and no data.

This needs a conversation before it needs a schema: a list of named school
reports, each exportable as PDF or CSV. Flagging it here so it stops being
invisible — it is the largest single gap in the console and it was on no list.

Related and smaller: **no PDF route exists for an IEP export or a learner
profile**, so D8b's "Export Profile as PDF" and the exporter's "Download PDF" are
both absent affordances. The only PDF in the API is the compliance audit's.

## 9 · D19 Invitations — four small fields

`InvitationResponse` is `{id, token, role, email, name, status, expiresAt,
deliveryStatus, consentStatus}`.

1. **No `classId`.** D19 draws a CLASS column; nothing sources it.
2. **No created-at.** D19 draws "Invited 9 Jul"; `expiresAt` is the only date.
3. **`status` is `string | null` with no enum** — while `deliveryStatus` and
   `consentStatus` on the *same schema* are both enums. The four lifecycle
   values the frame draws cannot be checked against the contract.
4. **`JoinInspectionResponse` is `{status, role, schoolName, expiresAt}` — no
   name**, so D19's "Welcome, Amara" greeting on the public join link has no
   source and the page says "you" instead.

And one that is structural rather than a field: **nothing can queue a parent
consent request for an INVITED student.**
`POST /students/{id}/parent-consent-requests` needs a student uuid, and the
contract never links an invitation to one before acceptance, nor mints a parent
link from an invite's bare contact. The children these flows create are exactly
the ones nobody can be asked about — which matters more since 15 Sep, when
withdrawal began being enforced.

## 10 · Three more, one per lane

**`NotificationResponse` has no `category`.** `NotificationCategory` exists in the
document but is used only by preferences. That kills D13b's filter pill, the
per-row category label, and category-scoped "Mark these as read". Separately,
three of SCRUM-100's six admin categories — roster, SSO, teacher — have no enum
value at all.

**Compliance D22 cannot verify two of its four claims.** `erasure` appears zero
times in the document and `ParentRightType` is
`request_data | object | withdraw_consent`; `subprocessor` appears zero times.
The rights-log read (thank you — see §11) closes the *requests* half of this
screen but not these two.

**The DPA document TEXT.** `GET/POST /api/v1/school/dpa-acceptance` shipped and
returns the acceptance RECORD — `{version, acceptedByName, acceptedAt}`. Nothing
returns `{version, html}`, so the wording a school is agreeing to is still held
in our client. That is the unfinished half of the 6 Sep launch blocker about
schools accepting 0.9-draft text, and we had been treating the row as closed
because the acceptance half landed.

## 11 · Corrections back to us, again

Two of these are ours, and both are the same shape as §4's: **a capability you
shipped, sitting unused behind a comment saying it does not exist.**

- **`GET /api/v1/consents/rights-log` has zero callers in our tree.** You built it
  to our own privacy specification — `reasonRecorded` as a boolean so the
  parent's free text never crosses the wire — and `ndpaClaims.ts:57` still reads
  "nothing reads one back". Ours to wire; nothing needed from you.
- **`POST /api/v1/users/me/profile-photo` has zero callers**, and
  `profileImageUrl` appears **nowhere in 681 source files** although
  `CurrentUserResponse` returns it on every `/users/me` we already call. We
  reported this as struck from the Settings ask on 15 Sep and then did not wire
  it.

**And one process note, offered in the same spirit as documenting `vatRate`.**
Our blocked list was wrong in both directions on the same afternoon: two rows had
shipped a day earlier, and eleven rows had never been written down. If a response
description named the code or field that closes a known gap — the way your 401
description on `login/password` names its three codes — a stale claim on our side
would be visible to a diff rather than to whoever happens to re-read the comment.

---

# Addendum 3 — 21 September 2026: a stale parent contact has no remedy anywhere

One ask, and it is **pre-launch**. It became urgent the moment SCRUM-162 made
parent contact email-only, and it has an exact precedent you shipped today, so
the design work is already done.

## 12 · A parent cannot change their own email, and nobody can change it for them

Design unblocked parent account setup on 21 Sep with a deliberately minimal
scope: **the contact field, and nothing else.** We cannot build it. There is no
endpoint that writes a parent's contact, from either direction:

- `GET /api/v1/students/{student_id}/parent-links` is **GET only** — no admin
  can correct a parent's address.
- `/api/v1/parents/me/children` and `.../growth` are **GET only** — no parent
  can correct their own.
- `POST /api/v1/students/{id}/parent-consent-requests` takes a `parentContact`,
  but that sends a request *to* an address; it does not update the record.
- `POST /api/v1/auth/parent/request-code` takes a `contact`, but that
  authenticates against what the school already holds.

**Why this is pre-launch rather than a gap.** Before SCRUM-162 a wrong email was
an inconvenience, because SMS was the other path. Email-only removes the other
path. A single mistyped character in a school's import now means:

- the parent never receives the consent request, so the school's consent record
  cannot be completed;
- the parent cannot sign in, so the data-rights surface NDPA s31 requires is
  unreachable for that family;
- **and nothing in the product can fix it** — not the parent, not the school
  admin, not support.

That is a family permanently locked out of the consent and data-rights
machinery by a typo, with no remedy. We would rather not launch into it.

### The ask: mirror what you shipped today for admins

`PATCH /api/v1/admin/email` and the `admin/email-confirmation` trio landed in
this morning's release and are exactly the right shape. We are asking for the
same four operations, parent-scoped:

| | mirrors |
|---|---|
| `PATCH /api/v1/parents/me/email` taking `EmailChange {email}` | `PATCH /api/v1/admin/email` |
| `GET /api/v1/parents/me/email-confirmation` returning `EmailConfirmationState {status, email, expiresAt, message}` | `GET /api/v1/admin/email-confirmation` |
| `POST /api/v1/parents/me/email-confirmation/verify` taking `ConfirmationToken {token}` | `POST /api/v1/admin/email-confirmation/verify` |
| `POST /api/v1/parents/me/email-confirmation/resend` | `POST /api/v1/admin/email-confirmation/resend` |

**No new schemas.** `EmailChange`, `ConfirmationToken` and
`EmailConfirmationState` all exist and are reused as-is.

**Confirm-before-switch matters more here than for admins**, and the pattern you
chose already does it: the new address must be verified before it replaces the
old one. Otherwise a typo in the *correction* locks the family out a second time
with no way back, and this is the one account in the product with no colleague
and no support route behind it.

### If you would rather it were admin-side

A `PATCH` on `parent-links` would also solve it, and is a smaller change. We
have specified the parent-side version because it needs no school
intervention — but a stale contact having *any* remedy is what matters. **Either
shape closes this; please do not do both.**

### What we are NOT asking for

No phone field, per SCRUM-162. No name or relationship edit — design scoped this
to the contact field alone and we are not widening it.
