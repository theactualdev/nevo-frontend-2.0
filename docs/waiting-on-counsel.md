# Waiting on counsel

**Six items, compiled 17 September 2026** from a sweep of `TODO(legal)` markers,
every "counsel" mention in `src/`, and `docs/open-questions-consent.md`. Verified
against the code and the deployed spec, not carried over from notes.

## Why this file exists separately

`docs/open-questions-consent.md` is the chronological record — questions asked,
answers received, rulings applied. It is worth keeping and it is not a register:
you cannot look at it and see what is *still outstanding* without reading all 298
lines and mentally cancelling the items that came back. Two of its counsel
questions have since been answered and one was withdrawn.

**This file is the outstanding list.** When an item is answered, move it to
*Answered* at the bottom with the date and the ruling — do not delete it, because
the next person needs to know it was asked.

**One rule, learned the hard way on the engineering side of this repo:** a
blocked list decays because the thing that unblocks a row never edits the row.
Before chasing anything here, re-read the code it names.

---

## 1 · DPA clause 5 — still with counsel; the consent position beside it has moved

**With Oladayo. The clause text is unchanged, and nothing here decides it.**

Clause 5 of the DPA warrants that Nevo "will not activate a learner whose
consent has not been confirmed".

**What this item used to say (17 Sep).** SCRUM-80 (7 Sep) ruled the opposite:
Nevo is not the consent gate, and a child may begin lessons while the school's
consent record is outstanding. So the clause promised a gate the product
deliberately did not have, and the question for counsel was which of the two
was right — a PROCESSOR reading (redraft the clause, SCRUM-80 stands) or a
CONTROLLER reading for the adaptation engine (the gate is deliberate, SCRUM-80
reverses).

**Where the product stands now (updated 7 Oct).** That SCRUM-80 position was
superseded by design's ruling of 23 Sep (`docs/RULINGS_23_SEP.md` §2b): *"The
gate is on the child's consent state, not on the route they arrived by. Every
entry path resolves consent before anything mounts."* As built:

- A child the consent gate holds — consent not given — waits on 00d at every
  door, and reaches neither the baseline nor a lesson (`studentDestination`,
  `src/lib/auth/entryGate.ts`).
- A child whose consent was withdrawn is held on 00e (D117).
- A consent check that cannot complete holds the child as well (D69, 4 and 6
  Oct).
- Inside the app, the server refuses a withdrawn child lessons, progress,
  offline copies and Ask Nevo (B7) and the signal stream (B44), and the client
  takes them to 00e.

So the conflict this item described, between the clause and SCRUM-80, no longer
describes the product.

**What is still open, and is counsel's.** Whether clause 5 stands as written,
and the processor-or-controller reading it rests on. The product's position
does not answer that, and this file does not either. The clause sits exactly as
counsel last had it in `src/lib/mocks/dpa.ts`, because rewording a term schools
formally accept is not engineering's to do.

## 2 · The DPA wording itself

`src/lib/mocks/dpa.ts` — `TODO(legal): replace wholesale when counsel returns
the final wording, and bump DPA_VERSION when you do.`

Schools are accepting a **placeholder**, and the screen says so: the document
pane carries the draft badge and the step is read-gated by scroll. The variable
structure is confirmed and is all the template interpolates — school name,
address, contract dates, enrolment band, effective date — and only the school
name is known during onboarding, so the rest render as named blanks rather than
invented values.

**This half is sound and needs nothing from engineering:** the acceptance is a
real record. `POST /api/v1/school/dpa-acceptance` stores `{version,
acceptedByUserId, acceptedByName, acceptedAt}`, so when the version moves we
know exactly who agreed to what and who must re-accept.

**When the wording lands, bump `DPA_VERSION` in the same change.** If the words
change and the version does not, every acceptance record silently becomes a lie.

## 3 · Privacy Policy and Terms of Service — and a gap counsel cannot close

`src/lib/mocks/legalDoc.ts` — `TODO(legal): replace wholesale when counsel
returns the final wording.` Currently **"Version 0.9 (draft)"**, badged on the
page as *"Placeholder wording — final legal text pending counsel"*, with each
section ending in a bracketed note naming what counsel must confirm: legal entity
name, RC number, registered address, NDPC registration reference.

**The part that is NOT counsel's, and will not be fixed by them delivering.**
Teachers affirmatively agree to this draft and **nothing records that they did**:

- `SetPasswordForm.tsx:412` is a real checkbox — *"I agree to Nevo's Privacy
  Policy and Terms of Service"*.
- `SetPasswordForm.tsx:156` **gates activation on it**:
  `canSubmit = allMet && matches && (!activation || consent)`.
- The tick is **never transmitted**. `consent` appears in exactly two places in
  that file: the gate and the checkbox render. It reaches no payload.
- **No endpoint exists to receive it.** Zero paths and zero schemas in the
  deployed spec match legal, privacy, terms or policy.

So unlike the DPA, when this version moves 0.9 → 1.0 there is no record of who
agreed to what, and therefore no way to identify who needs re-consenting.
**Consent cannot be reconstructed after the fact.** The fix is a
`POST /legal-acceptance` mirroring the DPA endpoint, and it is cheaper to have in
place *before* the version changes than after. **It can be specced and built now,
independent of counsel** — filed for backend, not for Oladayo.

## 4 · D22b compliance categories — confirm the categories are cleared

**With Oladayo.** D22b shows parental consent, data subject request and consent
withdrawal, each with dates and status and **no learner identified**. These are
genuine NDPA categories; the ask is simply confirmation that displaying them this
way is cleared.

**Blocked on backend regardless**, so this is not on the critical path: there is
no read endpoint for any of it. `POST /api/v1/parent/{token}/rights` mints a
`requestId` and nothing reads one back. (`GET /api/v1/consents/rights-log` now
exists and is unconsumed — worth re-checking whether it satisfies this before
treating the backend half as open.)

## 5 · The compliance PDF export — held, and it needs two sign-offs

Held behind `EXPORT_CLEARED_BY_COUNSEL = false` in
`src/components/admin/Compliance/ComplianceView.tsx:58` — a constant rather than
a deletion, so the wiring stays under test and the reason stays greppable.

**Note the name is half right.** The flag's own docblock says to flip it when
**backend** confirms in writing that the PDF carries neither `term` nor
`recordId`. So this needs *backend's confirmation of the file's contents* and
*counsel's clearance of the export being outside the original ruling*. Chasing
only Oladayo will not unblock it.

## 6 · Compliance export wording

`ComplianceView.tsx:44` — *"Export wording is placeholder pending counsel."* The
frame says so and the page repeats it rather than letting anyone assume
otherwise. Smallest item here; bundle it with 5.

---

## Deliberately NOT asked — flagging in case counsel wants it

**The zero-labels absolute.** `ndpaClaims.ts:33` records that **counsel has ruled
nothing** on the claim that Nevo stores no diagnostic label: *"The claim was never
put to them — the counsel checklist covers erasure, retention, DPA wording and
roster-sync consent, and not this."* So the file deliberately states what the
compliance scan proves rather than inventing a new legal absolute.

That is the right call for engineering to have made. But it is the single
strongest claim the product makes to a school, it appears on the compliance
screen and in the board pack, and nobody has asked a lawyer whether it may be
stated as an absolute. **Worth adding to the checklist deliberately, rather than
leaving as an omission nobody chose.**

**Retention limits.** `ndpaClaims.ts:282` dropped the title "Retention within
counsel limits" because whether a school's configured period satisfies counsel is
counsel's judgement, not the screen's. The copy now says records are kept "only
for the period set with counsel". Worth confirming that period actually *has*
been set with counsel, since the sentence asserts it.

---

## Answered — kept so nobody re-asks

- **Two compliance claim rows that may have breached rule 4** — asked 14 Sep,
  **both rows PULLED**, done. See `open-questions-consent.md` §4 of Rulings.
- **The scan is not an admin-facing list** — ruled 14 Sep, built.
- **NDPA s31 verifiable parental consent must be in place before launch** —
  confirmed by legal review; this is the ruling SCRUM-80 rested on. Item 1
  above records where the consent position stands now, and what counsel still
  has open on clause 5.
