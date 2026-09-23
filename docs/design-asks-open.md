# Open asks for design

Two questions, both with a recommendation attached so they can be answered with
a yes rather than a design session. Raised 23 September 2026.

Neither is a preference. Each is a place where **the deployed contract and the
current frames describe different products**, and the frontend is not allowed to
pick (AGENTS.md rule 10).

---

## 1 · Does a parent consent once, or once per thing?

### The frames say once

`admin/D25a Consent Form (Print)` — the paper form a school sends home — has a
single consent statement:

> *"I have read the above and I give my consent for my child to use Nevo, on the
> terms set out in the privacy notice."*

Cross-border transfer is **section 3, a disclosure**, not a separate signature.
One name, one signature, one date.

`parent/D01b Parent Consent` is the same shape digitally: one
**"Yes, I give my consent"** button. That is what is built and shipped.

### The contract says once per thing

`ConsentType`, in its own description:

> *"Each is asked and answered on its own. A parent agreeing to their child using
> Nevo has not thereby agreed to anything else, **which is the whole point of the
> fourth one below**."*

The fourth is `cross_border_transfer`. And `CompleteParentConsentRequest`:

> *"an empty list is a parent saying no to everything, which is a real answer,
> and a missing list is a client bug rather than a parent agreeing to whatever
> was asked."*

The response carries `declinedTypes`, and backend records a decline for every
type that was asked and not granted.

### Why it has not broken yet

Invitations currently request `data_processing` alone, so one tap grants exactly
the one thing that was asked. **It breaks the day an invitation carries two**: a
parent would grant `cross_border_transfer` — a Nigerian child's data leaving the
country — by pressing a button whose label does not mention it.

### What we would like

**A ruling on which is true**, and we think the honest answer is that both are,
for different routes:

- **Paper stays one signature.** A form with four tick-boxes returned by four
  hundred families is a matching problem, and D25a is already drafted.
- **Digital becomes per-type**, because it can be, and because the contract's
  own words say a single Yes does not carry the fourth type.

**If you would rather keep one tap everywhere**, say so and we will build the
guard instead: the screen refuses to render when an invitation carries more than
one `consentType`, rather than silently granting something the button never
named. That is our default if this goes unanswered.

**Either way, three pieces of legal text are still outstanding on D25a** — the
privacy notice, the cross-border statement and the consent statement are all
marked *"to be supplied by Nevo's counsel"*, and the form is stamped v0.0 DRAFT.
The written route cannot ship without them.

---

## 2 · Where does a school choose how everyone signs in?

### What happened

`admin/D01 School Onboarding` went from five steps to four in the 20 September
drop. Its rail is now:

> **1** Sign up · **2** Confirm email · **3** DPA read-gate · **4** School details
> → Dashboard (OB-00)

Two steps we have built are no longer on it, and the frame mentions neither a
sign-in method nor a band anywhere.

### The band step we think is simply dead

`BandStep` (D1.4, enrolment band) — its own note already recorded that D1's frame
drew *"a flat ₦150,000 per student per year, no tiers, no plan to choose"*, and
`D24 Getting to Active` now confirms flat pricing with the cost living on a
standing dashboard panel (OB-03). **We will delete it unless you say otherwise.**
No answer needed.

### The sign-in method step is a real question

`AuthMethodStep` (D1.2) is the choice between an **SSO school** (roster syncs,
no school codes, the IT surface live) and a **manual school** (school code,
hand-built roster). Its own comment records why it mattered:

> *"the most consequential choice in the product… no edit affordance for it
> exists anywhere else in the admin app."*

Everything in SCRUM-40 and SCRUM-97 forks on it. D5 Classes changes shape on it:
where the provider owns the class list, **Create is absent rather than disabled**
and archive does not appear at all.

**So: if it is not step 2 any more, where is it?** Three possibilities and they
are not equivalent:

1. **It moved into "School details" (step 4)** — fine, we build it there.
2. **It moved into the OB-00 dashboard** — also fine, but it changes what a
   school can do before it is active.
3. **It was cut** — then every school gets a default it never chose, and if that
   default is "manual", an SSO school has no route to the IT surface at all.

We are not deleting 249 lines on our reading of a step rail, and we are not
inventing a new home for it either. One sentence settles it.

---

## What we are doing in the meantime

Nothing that depends on either answer. Both defaults above are conservative: keep
what is built, guard against the case that would be wrong, and wait.
