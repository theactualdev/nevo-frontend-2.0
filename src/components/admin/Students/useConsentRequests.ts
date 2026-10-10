"use client";

import { useCallback, useState } from "react";
import { ApiError, apiErrorCode, apiErrorMessage } from "@/lib/api/client";
import {
  consentsApi,
  type BulkParentConsentResult,
  type ConsentDeliveryStatus,
} from "@/lib/api/consents";
import { studentsApi } from "@/lib/api/students";

/**
 * Sending a parent the consent request - the trigger nothing in Nevo had.
 *
 * ============================================================================
 * `consentsApi.requestParentConsent` was typed with ZERO CALLERS, and the whole
 * parent surface sat behind it: three finished, merged screens that no family
 * could reach, because nothing in the product could send anyone a link. D07's
 * row action, D07b's card action and the Overview checklist's dead row all
 * pointed at this one call.
 * ============================================================================
 *
 * THE PARENT'S DETAILS COME FROM THE RECORD, NOT A FORM. `POST
 * /students/{id}/parent-consent-requests` needs `{parentName, parentContact,
 * contactMethod}`, and `ParentLink` carries all three - so the admin presses
 * one thing, as D07 draws it ("Sending a request is deliberate and
 * per-student"), rather than retyping a contact the school already gave us.
 * The roster row does not carry the link, so it is fetched on the press.
 *
 * A STUDENT WITH NO CONTACT IS NOT AN ERROR. It is the ordinary state of a
 * child enrolled before anyone recorded a guardian, and it gets its own
 * outcome rather than a failure - "never a dead end", and no red.
 *
 * THE RECEIPT IS READ, NOT ASSUMED. The endpoint answers 202 with a
 * `deliveryStatus` of `queued | processing | sent | failed`, and only `sent`
 * means a parent was actually written to. This is the same defect the invite
 * surfaces carried until 8 Sep - "N invites sent" over a response that said
 * nobody was emailed - and it is not being repeated here.
 */

export type ConsentRequestState =
  | { kind: "idle" }
  | { kind: "sending" }
  /** The backend took it. `delivery` says whether it actually went out. */
  | { kind: "done"; parentName: string; delivery: ConsentDeliveryStatus }
  /** No guardian contact on the record, so there is nobody to send to. */
  | { kind: "noContact" }
  /**
   * There IS a contact, but it is not an email address - a phone number, from
   * before SCRUM-162. Distinct from `noContact` because the school's next
   * action is different: add an email to a record that already has a guardian,
   * rather than find a guardian.
   */
  | { kind: "needsEmail"; parentName: string }
  /**
   * 409 `parent_already_refused`: this parent was asked about this child and
   * did not consent, and Nevo does not contact them again. Enforced by the
   * server at the point of contact (the DPA keeps a minimal record of the
   * refusal for exactly this). The message is backend's, safe to show as it
   * stands. Keyed on that parent for that child - another guardian is still
   * askable.
   */
  | { kind: "refused"; message: string }
  | { kind: "failed" };

const IDLE: ConsentRequestState = { kind: "idle" };

/** Parent-link reads in flight at once while a bulk send gathers contacts. */
const BULK_AT_ONCE = 4;

/**
 * Children per bulk call. The route takes 500; a smaller batch keeps the
 * progress moving on a large school and one slow call from holding them all.
 */
const BULK_BATCH = 100;

/**
 * What a bulk send came to, by the receipt each request got. `sent` is only
 * a receipt that says sent - a queued one is counted apart, because "N sent"
 * over requests still queued is the invite defect again.
 */
export interface BulkConsentTally {
  sent: number;
  queued: number;
  undelivered: number;
  /** No guardian on record, or only a phone number: no email to send to. */
  noEmail: number;
  refused: number;
  failed: number;
}

const EMPTY_TALLY: BulkConsentTally = {
  sent: 0,
  queued: 0,
  undelivered: 0,
  noEmail: 0,
  refused: 0,
  failed: 0,
};

function countInto(t: BulkConsentTally, s: ConsentRequestState) {
  if (s.kind === "done") {
    if (s.delivery === "sent") t.sent++;
    else if (s.delivery === "failed") t.undelivered++;
    else t.queued++;
  } else if (s.kind === "noContact" || s.kind === "needsEmail") t.noEmail++;
  else if (s.kind === "refused") t.refused++;
  else if (s.kind === "failed") t.failed++;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * The lines after a bulk send. D07's own words where it has them - "{ok}
 * invitation(s) sent", and "could not be sent: those students do not have a
 * parent email address on file yet" - and a line for each other outcome, so
 * no request disappears from the count.
 */
export function bulkConsentLines(t: BulkConsentTally): string[] {
  const lines: string[] = [];
  if (t.sent) lines.push(`${t.sent} ${plural(t.sent, "invitation", "invitations")} sent.`);
  if (t.queued) {
    lines.push(
      `${t.queued} ${plural(t.queued, "invitation is", "invitations are")} queued and ${plural(t.queued, "goes", "go")} out shortly.`,
    );
  }
  if (t.undelivered) {
    lines.push(
      `${t.undelivered} couldn’t be delivered. Those parents’ contact details may need checking.`,
    );
  }
  if (t.noEmail) {
    lines.push(
      `${t.noEmail} could not be sent: ${plural(t.noEmail, "that student does", "those students do")} not have a parent email address on file yet.`,
    );
  }
  if (t.refused) {
    lines.push(
      `${t.refused} ${plural(t.refused, "parent was", "parents were")} already asked and did not consent, so Nevo did not contact them again.`,
    );
  }
  if (t.failed) {
    lines.push(`${t.failed} didn’t send, and nothing changed for those. Try them again in a moment.`);
  }
  return lines;
}

/**
 * SCRUM-162 (20 Sep): parent contact is EMAIL ONLY. No phone, no SMS.
 *
 * This function used to pick a method, and would choose `sms` for any contact
 * without an `@` - including one the school had never said was a phone. That
 * is the behaviour the ruling removes: *"You cannot collect personal data you
 * have no use for."* Nevo no longer sends anything by SMS, so nothing here may
 * ask it to.
 *
 * **The enum is now `email` alone, and this comment said otherwise for a day.**
 * It read: *"`ParentContactMethod` is still `["email","sms"]` on the deployed
 * contract (re-checked 21 Sep)"*. The backend half of SCRUM-162 had landed on
 * 20 Sep. The same false assertion sat in `parent.ts` and `consents.ts`, all
 * three written on the evidence of one probe and none re-run.
 *
 * The constant below survives the correction unchanged, which is the point
 * worth keeping: it was right for a reason that did not depend on the enum.
 * We stopped CHOOSING sms because the ruling says Nevo has no use for a phone
 * number, not because the type forbade it. Code that follows the ruling rather
 * than the type is still correct when the type catches up.
 */
const CONTACT_METHOD = "email" as const;

/** An address we can actually email. Deliberately the same test the CSV import uses. */
export function isEmail(contact: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.trim());
}

export function useConsentRequests() {
  const [byStudent, setByStudent] = useState<
    Record<string, ConsentRequestState>
  >({});

  const stateFor = useCallback(
    (studentId: string): ConsentRequestState => byStudent[studentId] ?? IDLE,
    [byStudent],
  );

  const set = useCallback((studentId: string, next: ConsentRequestState) => {
    setByStudent((prev) => ({ ...prev, [studentId]: next }));
  }, []);

  /**
   * One request, start to finish, and the state it ended in. Every outcome is
   * written to the row as it lands, so a bulk send fills the roster in row by
   * row rather than all at once at the end.
   */
  const run = useCallback(
    (studentId: string): Promise<ConsentRequestState> => {
      const end = (next: ConsentRequestState) => {
        set(studentId, next);
        return next;
      };
      set(studentId, { kind: "sending" });
      return (
        studentsApi
          .parentLinks(studentId)
          .then((links): ConsentRequestState | Promise<ConsentRequestState> => {
            /*
             * A named guardian first; failing that, one recorded at enrolment
             * with an email and no name yet. This took named links only, and
             * told a school with a guardian on record that there was nobody.
             * The name is optional on the request now (backend, 1 Oct): the
             * parent gives their own at consent, and a blank one reads
             * "Parent or guardian" on their screen.
             */
            const link =
              links.find((l) => l.parentContact && l.parentName.trim()) ??
              links.find((l) => l.parentContact);
            if (!link) return end({ kind: "noContact" });
            const who = link.parentName.trim() || link.parentContact;
            /*
             * A PHONE NUMBER IS NO LONGER SOMETHING WE CAN SEND TO (SCRUM-162).
             * Before the ruling this fell through to `contactMethod: "sms"`.
             * Sending it as `"email"` instead would be worse than refusing: the
             * request would go nowhere and the school would be told it was
             * queued. Refusing names the record that needs an email, which is
             * the action the ruling actually requires of the school.
             */
            if (!isEmail(link.parentContact)) {
              return end({ kind: "needsEmail", parentName: who });
            }
            return consentsApi
              .requestParentConsent(studentId, {
                parentName: link.parentName,
                parentContact: link.parentContact,
                contactMethod: CONTACT_METHOD,
              })
              .then((receipt) =>
                end({ kind: "done", parentName: who, delivery: receipt.deliveryStatus }),
              );
          })
          // One catch for both round trips is deliberate here, unlike the
          // onboarding case: neither of them writes anything on the way to the
          // POST, so a failure at either point means no request was created.
          .catch((err: unknown) => end(refusal(err) ?? { kind: "failed" }))
      );
    },
    [set],
  );

  const send = useCallback(
    (studentId: string) => {
      void run(studentId);
    },
    [run],
  );

  /**
   * D07's bulk send (Lydia, 7 Oct: "D07 wins. Bulk send exists.").
   *
   * THE BULK ROUTE NOW (backend, 8 Oct): `POST /consents/parent-consent-
   * requests/bulk`, one call for up to 500 children, each answered with its
   * own outcome. The route still needs each parent's contact, which lives on
   * the child's parent links - so those are read first, a few at a time, and
   * a child with no guardian or only a phone number is settled right there,
   * exactly as the row's own "Send request" settles it. Everyone left goes in
   * batches. Nothing is retried on the admin's behalf: a failure is counted
   * and said, and the row keeps its own "Send request".
   */
  const sendMany = useCallback(
    async (
      studentIds: string[],
      onProgress?: (done: number) => void,
    ): Promise<BulkConsentTally> => {
      const tally: BulkConsentTally = { ...EMPTY_TALLY };
      let done = 0;
      const settle = (id: string, outcome: ConsentRequestState) => {
        set(id, outcome);
        countInto(tally, outcome);
        onProgress?.(++done);
      };

      // 1. Who each request goes to, from the record.
      const ready: { studentId: string; who: string; parentName: string; parentContact: string }[] = [];
      let next = 0;
      const reader = async () => {
        while (next < studentIds.length) {
          const id = studentIds[next++];
          set(id, { kind: "sending" });
          try {
            const links = await studentsApi.parentLinks(id);
            const link =
              links.find((l) => l.parentContact && l.parentName.trim()) ??
              links.find((l) => l.parentContact);
            if (!link) {
              settle(id, { kind: "noContact" });
              continue;
            }
            const who = link.parentName.trim() || link.parentContact;
            if (!isEmail(link.parentContact)) {
              settle(id, { kind: "needsEmail", parentName: who });
              continue;
            }
            ready.push({ studentId: id, who, parentName: link.parentName, parentContact: link.parentContact });
          } catch (err: unknown) {
            settle(id, refusal(err) ?? { kind: "failed" });
          }
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(BULK_AT_ONCE, studentIds.length) }, reader),
      );

      // 2. The requests themselves, a batch per call.
      for (let i = 0; i < ready.length; i += BULK_BATCH) {
        const batch = ready.slice(i, i + BULK_BATCH);
        let results: BulkParentConsentResult[] = [];
        try {
          results = await consentsApi.requestParentConsentBulk(
            batch.map(({ studentId, parentName, parentContact }) => ({
              studentId,
              parentName,
              parentContact,
              contactMethod: CONTACT_METHOD,
            })),
          );
        } catch {
          // The whole call failed: none of this batch was queued.
          results = [];
        }
        const byId = new Map(results.map((r) => [r.studentId, r]));
        for (const item of batch) {
          settle(item.studentId, bulkOutcome(byId.get(item.studentId), item.who));
        }
      }
      return tally;
    },
    [set],
  );

  return { stateFor, send, sendMany };
}

/** What to tell the admin, in the frame's own voice. Never red, never alarm. */
export function consentRequestLine(
  state: ConsentRequestState,
  studentName: string,
): string | null {
  switch (state.kind) {
    case "sending":
      return "Sending…";
    case "done":
      return state.delivery === "sent"
        ? `Consent request sent to ${state.parentName}.`
        : state.delivery === "failed"
          ? `We couldn’t get that to ${state.parentName}. Their contact details may need checking.`
          : // queued | processing - taken, not yet delivered. Saying "sent"
            // here would be the invite defect again.
            `Consent request queued for ${state.parentName}. It goes out shortly.`;
    case "noContact":
      // Was a full stop after "nobody to send this to". There is an action
      // now - adding a guardian sends the request - so the line names it.
      return `There’s no parent or guardian on ${studentName}’s record yet. Add one on ${studentName}’s page and the request goes to them.`;
    case "refused":
      return state.message;
    case "needsEmail":
      // Names the guardian, so the admin knows the record is not empty - it is
      // the wrong KIND of contact. "Never a dead end": it says what to add.
      return `We only have a phone number for ${state.parentName}. Consent requests go by email, so ${studentName}’s record needs an email address for them.`;
    case "failed":
      return "That didn’t send, and nothing has changed. Try again in a moment.";
    default:
      return null;
  }
}

/**
 * One child's state from the bulk route's answer. A child the answer does not
 * mention was not queued - counted as a failure, never assumed sent.
 */
export function bulkOutcome(
  result: BulkParentConsentResult | undefined,
  parentName: string,
): ConsentRequestState {
  if (!result) return { kind: "failed" };
  if (result.queued) {
    return { kind: "done", parentName, delivery: result.request?.deliveryStatus ?? "queued" };
  }
  if (result.errorCode === "parent_already_refused") {
    return { kind: "refused", message: result.errorMessage?.trim() || REFUSED_FALLBACK };
  }
  return { kind: "failed" };
}

/** The refusal's own words, when the server refused because this parent said no. */
export const REFUSED_FALLBACK =
  "This parent was already asked about this learner and did not consent. Nevo does not contact them again. Speak to them directly if something has changed.";

export function refusal(err: unknown): { kind: "refused"; message: string } | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  if (apiErrorCode(err.detail) !== "parent_already_refused") return null;
  return { kind: "refused", message: apiErrorMessage(err.detail) ?? REFUSED_FALLBACK };
}
