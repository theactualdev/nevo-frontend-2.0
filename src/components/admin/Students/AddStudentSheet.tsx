"use client";

import { useEffect, useMemo, useState } from "react";
import { classesApi, type AdminClass } from "@/lib/api/classes";
import { ApiError, apiErrorMessage } from "@/lib/api/client";
import { onboardingApi, type AdditionQuote } from "@/lib/api/onboarding";
import { studentsApi } from "@/lib/api/students";
import { formatMoney, formatVatRate } from "@/lib/money";
import { cn } from "@/lib/utils";
import { billingCurrency } from "../Roster/activation";
import {
  FailureLine,
  GHOST_BTN,
  PRIMARY_BTN,
  Sheet,
  Spinner,
} from "../Roster/primitives";

/**
 * D24b OB-06, "Add a student" - one child joining mid-term, with what they
 * cost shown before the school confirms.
 *
 * ============================================================================
 * THE FRAME PROMISES A CHARGE AND NOTHING CHARGES.
 *
 * D24b draws *"Charged now ₦59,125"* and a button reading *"Add Zainab &
 * charge ₦59,125"*. Backend, 25 Sep: enrolling has no billing side effect at
 * all, and there is no charge endpoint for an addition. The scheduled invoice
 * run counts whoever is active when it runs, so an addition reaches a school
 * as a BIGGER NEXT INVOICE - not a charge of its own, and not a separate line.
 *
 * So the word "charge" does not appear, and "charged now" does not appear. The
 * button says what will actually happen, in backend's suggested words: *"Add
 * Zainab - ₦59,125 on your next invoice."* A school reading "& charge" would
 * reasonably believe money had left the account.
 *
 * NOT PRORATED, EITHER. The quote is the full per-student rate for a whole
 * term, not the weeks left in this one. The frame's own footnote is right
 * about that - *"no reduction for weeks already passed"* - so it stays.
 *
 * ============================================================================
 * THREE DELIBERATE DIFFERENCES FROM THE FRAME:
 *
 * - **Two name fields, not one "Full name".** The enrol body takes `firstName`
 *   and `lastName` separately. Splitting one field would be guessing where a
 *   Nigerian name divides, and a school would find the wrong half in the
 *   surname column.
 * - **No parent email.** Backend asked for it to be held: the parent record
 *   needs a name as well, and creating one while consent is frozen would mean
 *   storing a parent's address and never sending the request it exists for.
 * - **Date of birth is optional.** Refusing an enrolment over a missing date
 *   would keep a child out of lessons. The server refuses a future date; this
 *   sheet does not second-guess the clock to do that first.
 */

const LABEL = "mb-[7px] block text-[12.5px] font-semibold text-nevo-near-black/60";
const FIELD =
  "h-[50px] w-full rounded-[10px] border-[1.5px] border-nevo-near-black/16 bg-nevo-cream px-[15px] text-[15px] text-nevo-near-black outline-none transition-colors focus:border-nevo-navy";

type Phase = "idle" | "saving" | "failed";

export function AddStudentSheet({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (studentId: string) => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [classId, setClassId] = useState("");
  const [dob, setDob] = useState("");
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [quote, setQuote] = useState<AdditionQuote | null>(null);
  const [quoteFailed, setQuoteFailed] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [failNote, setFailNote] = useState<string | null>(null);

  useEffect(() => {
    classesApi
      .list()
      .then(setClasses)
      .catch(() => setClasses([]));

    /*
     * ONE STUDENT, QUOTED ONCE. What one child costs does not depend on which
     * child, so this is asked on open rather than on every keystroke - and the
     * contract is explicit that a school asks for the price *"before it asks
     * for the people"*.
     */
    onboardingApi
      .quoteAddition({ students: 1 })
      .then(setQuote)
      .catch(() => setQuoteFailed(true));
  }, []);

  const currency = billingCurrency(quote?.currency);
  const total = useMemo(
    () => (quote && currency ? formatMoney(quote.totalWithVat, currency) : null),
    [quote, currency],
  );

  const canSave =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    classId.length > 0 &&
    phase !== "saving";

  const submit = () => {
    if (!canSave) return;
    setPhase("saving");
    setFailNote(null);
    studentsApi
      .enroll({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        classId,
        // Empty is absent, not "": a blank optional field is no answer.
        dateOfBirth: dob || null,
      })
      .then((created) => onAdded(created.id))
      .catch((err: unknown) => {
        /*
         * THE SERVER'S REASON WHEN IT GAVE ONE. A future date of birth is
         * refused with a 422, and "That didn't save" over a date the school
         * can fix in two seconds would leave them guessing which field.
         */
        setFailNote(err instanceof ApiError ? apiErrorMessage(err.detail) : null);
        setPhase("failed");
      });
  };

  const first = firstName.trim();

  return (
    <Sheet
      busy={phase === "saving"}
      title="Add a student"
      subtitle="One student joining your school now. You'll see what it adds to your next invoice before you confirm."
      onClose={onClose}
      footer={
        phase === "saving" ? (
          <div className="flex flex-1 items-center justify-center gap-2.5 py-3">
            <Spinner />
            <span className="text-sm text-nevo-near-black/60">
              Adding the student&hellip;
            </span>
          </div>
        ) : (
          <>
            {phase === "failed" ? (
              <FailureLine>
                {failNote ??
                  "That didn’t save. Nothing has been added, and what you typed is still here."}
              </FailureLine>
            ) : null}
            <button
              type="button"
              onClick={submit}
              disabled={!canSave}
              className={cn(PRIMARY_BTN, "flex-1 justify-center")}
            >
              {/*
                * "Add Zainab - ₦59,125 on your next invoice", never "& charge".
                * The amount only appears once there is one to state; without
                * a quote the button still works, because adding charges
                * nothing and the next invoice will say what it costs.
                */}
              {first && total
                ? `Add ${first} — ${total} on your next invoice`
                : first
                  ? `Add ${first}`
                  : "Add student"}
            </button>
            <button type="button" onClick={onClose} className={GHOST_BTN}>
              Cancel
            </button>
          </>
        )
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="student-first" className={LABEL}>
            First name
          </label>
          <input
            id="student-first"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="off"
            className={FIELD}
          />
        </div>
        <div>
          <label htmlFor="student-last" className={LABEL}>
            Surname
          </label>
          <input
            id="student-last"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="off"
            className={FIELD}
          />
        </div>
      </div>

      <div>
        <label htmlFor="student-class" className={LABEL}>
          Class
        </label>
        <select
          id="student-class"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          className={cn(FIELD, "cursor-pointer")}
        >
          <option value="">Choose a class</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="student-dob" className={LABEL}>
          Date of birth <span className="font-normal">(optional)</span>
        </label>
        <input
          id="student-dob"
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          className={FIELD}
        />
      </div>

      <CostPanel quote={quote} failed={quoteFailed} total={total} />
    </Sheet>
  );
}

/**
 * What this addition adds to the next invoice.
 *
 * Every figure is the server's - rate, subtotal, VAT and total all arrive
 * pre-computed and rounded from the same pricing function as the billing
 * sheet. Nothing here multiplies, adds or applies a rate.
 */
function CostPanel({
  quote,
  failed,
  total,
}: {
  quote: AdditionQuote | null;
  failed: boolean;
  total: string | null;
}) {
  const currency = billingCurrency(quote?.currency);

  if (failed || (quote && !currency)) {
    /*
     * No figure rather than a guessed one. Adding still works - it charges
     * nothing - and the next invoice will state what it costs; this panel just
     * cannot say so in advance.
     */
    return (
      <p className="m-0 rounded-[10px] bg-nevo-violet/[0.14] px-4 py-3.5 text-[13.5px] leading-[1.55] text-nevo-navy">
        We couldn&rsquo;t load the cost just now. Adding a student adds them to
        your next invoice &ndash; nothing is taken today.
      </p>
    );
  }

  if (!quote || !currency) {
    return <div className="h-[132px] animate-pulse rounded-[10px] bg-nevo-near-black/[0.04]" />;
  }

  const money = (v: string) => formatMoney(v, currency);
  const vat = formatVatRate(quote.vatRate);

  return (
    <div className="rounded-[10px] border border-nevo-near-black/10 px-4 py-3.5">
      <p className="m-0 text-[12.5px] font-semibold tracking-[0.04em] text-nevo-near-black/50 uppercase">
        {/*
          * The term, when the school has configured one. Null is a real answer
          * - there is genuinely no term to name - and an invented one on a
          * price is worse than none.
          */}
        {quote.appliesTo ? `Joins in ${quote.appliesTo}` : "Cost"}
      </p>
      <dl className="m-0 mt-2.5 space-y-1.5 text-[14px]">
        <Line label={`1 student × ${money(quote.perStudentRate)}`} value={money(quote.totalBeforeVat)} />
        <Line label={vat ? `VAT at ${vat}` : "VAT"} value={money(quote.vatAmount)} />
        <Line label="Added to your next invoice" value={total ?? money(quote.totalWithVat)} strong />
      </dl>
      <p className="m-0 mt-3 text-[12.5px] leading-[1.55] text-nevo-near-black/55">
        {/*
          * NO "CHARGE" ANYWHERE, INCLUDING NEGATED. "Nothing is charged now" is
          * true and reassuring, but the test that guards this screen bans the
          * word outright - a regex clever enough to allow the negation is
          * clever enough to let "Charged now £X" back in when somebody edits
          * the "Nothing" out. So the sentence says when instead of what not.
          */}
        The full term price, with no reduction for weeks already passed.
        It&rsquo;s added to your next invoice rather than taken now.
      </p>
    </div>
  );
}

function Line({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={cn("text-nevo-near-black/62", strong && "font-semibold text-nevo-near-black")}>
        {label}
      </dt>
      <dd className={cn("m-0 text-nevo-near-black", strong && "text-[15.5px] font-semibold")}>
        {value}
      </dd>
    </div>
  );
}
