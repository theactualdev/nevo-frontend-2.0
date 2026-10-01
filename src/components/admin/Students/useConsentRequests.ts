"use client";

import { useCallback, useState } from "react";
import { ApiError, apiErrorCode, apiErrorMessage } from "@/lib/api/client";
import { consentsApi, type ConsentDeliveryStatus } from "@/lib/api/consents";
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

  const send = useCallback(
    (studentId: string) => {
      set(studentId, { kind: "sending" });
      studentsApi
        .parentLinks(studentId)
        .then((links) => {
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
          if (!link) {
            set(studentId, { kind: "noContact" });
            return;
          }
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
            set(studentId, {
              kind: "needsEmail",
              parentName: who,
            });
            return;
          }
          return consentsApi
            .requestParentConsent(studentId, {
              parentName: link.parentName,
              parentContact: link.parentContact,
              contactMethod: CONTACT_METHOD,
            })
            .then((receipt) =>
              set(studentId, {
                kind: "done",
                parentName: who,
                delivery: receipt.deliveryStatus,
              }),
            );
        })
        // One catch for both round trips is deliberate here, unlike the
        // onboarding case: neither of them writes anything on the way to the
        // POST, so a failure at either point means no request was created.
        .catch((err: unknown) =>
          set(
            studentId,
            refusal(err) ?? { kind: "failed" },
          ),
        );
    },
    [set],
  );

  return { stateFor, send };
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

/** The refusal's own words, when the server refused because this parent said no. */
export const REFUSED_FALLBACK =
  "This parent was already asked about this learner and did not consent. Nevo does not contact them again. Speak to them directly if something has changed.";

export function refusal(err: unknown): { kind: "refused"; message: string } | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  if (apiErrorCode(err.detail) !== "parent_already_refused") return null;
  return { kind: "refused", message: apiErrorMessage(err.detail) ?? REFUSED_FALLBACK };
}
