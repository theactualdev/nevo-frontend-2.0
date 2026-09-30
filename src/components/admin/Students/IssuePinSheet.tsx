"use client";

import { useState } from "react";
import { studentsApi, type PinIssueResponse } from "@/lib/api/students";
import { cn } from "@/lib/utils";
import {
  FailureLine,
  GHOST_BTN,
  PRIMARY_BTN,
  Sheet,
  Spinner,
} from "../Roster/primitives";

/**
 * Issue a child a new PIN, for D7b.
 *
 * THE PRODUCT PROMISED THIS AND NOTHING PERFORMED IT. `ForgotPinScreen`
 * carries the frame's note - "No self-service reset, points gently to the
 * teacher, never a dead end" - and tells a locked-out child to ask an adult.
 * `POST /api/v1/students/{id}/pin/reset` has been deployed and had zero callers
 * in any console, so the adult had nothing to press. A child locked out of
 * their own account stayed locked out.
 *
 * FOUR RULINGS, because the contract does not make these for us:
 *
 * 1. **It confirms before it calls.** The endpoint RESETS - the child's current
 *    PIN stops working the instant it returns. Issuing one to "check" would
 *    lock out a child who was fine. So the first phase states the consequence
 *    and nothing has happened until the button is pressed.
 *
 * 2. **The PIN is shown once, and the sheet says so.** The response is the only
 *    time this value exists anywhere we can see; nothing reads it back. An
 *    admin who closes the sheet without writing it down has to issue another,
 *    which locks the child out again - so that cost is stated ON the screen
 *    holding the number, not discovered afterwards.
 *
 * 3. **NO COPY BUTTON, deliberately.** `mustShareSecurely` is the server
 *    telling us how this may travel, and the frame's instruction is that an
 *    adult hands it over in person. A copy button exists to paste somewhere,
 *    and everywhere you can paste a PIN is not in person. The number is set
 *    large and spaced instead, which is what reading it aloud or writing it
 *    down actually needs.
 *
 * 4. **`mustShareSecurely` is READ, not assumed.** It is a required boolean, so
 *    the server can say false, and a screen that hard-codes the warning would
 *    be putting words in its mouth. False gets the plain line instead.
 *
 * The value is never logged, never put in component state beyond this sheet's
 * lifetime, and never sent anywhere.
 */

type Phase = "confirm" | "issuing" | "issued" | "failed";

/** 4-6 digits read aloud or copied onto paper. Group them so the eye can. */
function grouped(pin: string) {
  return pin.length === 6 ? `${pin.slice(0, 3)} ${pin.slice(3)}` : pin;
}

export function IssuePinSheet({
  studentId,
  studentName,
  onClose,
}: {
  studentId: string;
  studentName: string;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("confirm");
  const [issued, setIssued] = useState<PinIssueResponse | null>(null);

  const firstName = studentName.split(" ").filter(Boolean)[0] ?? studentName;

  const issue = () => {
    setPhase("issuing");
    studentsApi
      .issuePin(studentId)
      .then((res) => {
        setIssued(res);
        setPhase("issued");
      })
      .catch(() => setPhase("failed"));
  };

  return (
    <Sheet
      busy={phase === "issuing"}
      title={
        phase === "issued"
          ? `${firstName}'s new PIN`
          : `Give ${firstName} a new PIN`
      }
      subtitle={
        phase === "issued"
          ? undefined
          : "Use this when they can't get in and can't remember theirs."
      }
      onClose={onClose}
      footer={
        phase === "issuing" ? (
          <div className="flex flex-1 items-center justify-center gap-2.5 py-3">
            <Spinner />
            <span className="text-sm text-nevo-near-black/60">
              Issuing a new PIN&hellip;
            </span>
          </div>
        ) : phase === "issued" ? (
          /*
           * ONE WAY OUT, AND IT IS AN ACKNOWLEDGEMENT. "Cancel" would be a lie
           * next to a PIN that is already live, and a second action beside it
           * invites a misclick on the one screen where leaving costs the child
           * another lockout.
           */
          <button
            type="button"
            onClick={onClose}
            className={cn(PRIMARY_BTN, "flex-1 justify-center")}
          >
            I&rsquo;ve written it down
          </button>
        ) : phase === "failed" ? (
          <>
            <FailureLine>
              That didn&rsquo;t go through, so {firstName}&rsquo;s PIN
              hasn&rsquo;t changed. They can still use their old one.
            </FailureLine>
            <button type="button" onClick={issue} className={PRIMARY_BTN}>
              Try again
            </button>
            {/* SCRUM-40: "Primary 'Try again', secondary 'Close'." A failure with
                one way out holds the sheet open until it succeeds. */}
            <button type="button" onClick={onClose} className={GHOST_BTN}>
              Close
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={issue}
              className={cn(PRIMARY_BTN, "flex-1 justify-center")}
            >
              Issue a new PIN
            </button>
            <button type="button" onClick={onClose} className={GHOST_BTN}>
              Cancel
            </button>
          </>
        )
      }
    >
      {phase === "issued" && issued ? (
        <>
          <div>
            <span className="mb-[7px] block text-[12.5px] font-semibold text-nevo-near-black/60">
              Their PIN
            </span>
            <p className="m-0 rounded-[10px] bg-nevo-cream-elevated px-[15px] py-5 text-center text-[34px] leading-none font-semibold tracking-[0.14em] text-nevo-near-black tabular-nums">
              {grouped(issued.pin)}
            </p>
          </div>

          <p className="m-0 text-[13.5px] leading-[1.55] text-nevo-near-black/70">
            {/*
              * THE COST OF CLOSING, said while the number is still on screen.
              * Nothing reads a PIN back - not this console, not the contract -
              * so an admin who closes without writing it down has to issue
              * another, which locks the child out a second time.
              */}
            <strong className="font-semibold text-nevo-near-black">
              This is the only time you&rsquo;ll see it.
            </strong>{" "}
            Write it down before you close this. If you lose it you can issue
            another, but that one locks {firstName} out again until they have
            it.
          </p>

          {issued.mustShareSecurely ? (
            <p className="m-0 rounded-[10px] bg-nevo-violet/16 px-4 py-3 text-[13.5px] leading-[1.55] text-nevo-near-black/78">
              Hand it to {firstName} in person. Don&rsquo;t send it by message
              or email &ndash; anyone who reads it can sign in as them.
            </p>
          ) : (
            <p className="m-0 text-[13.5px] leading-[1.55] text-nevo-near-black/70">
              Give it to {firstName} directly, and only to them.
            </p>
          )}

          <p className="m-0 text-[13px] leading-[1.5] text-nevo-near-black/55">
            Their old PIN stopped working just now, so they&rsquo;ll need this
            one to get back in.
          </p>
        </>
      ) : (
        <>
          <p className="m-0 text-[13.5px] leading-[1.55] text-nevo-near-black/70">
            We&rsquo;ll make a new PIN for {firstName} and show it to you once.
            You hand it to them in person.
          </p>

          <div>
            <span className="mb-[7px] block text-[12.5px] font-semibold text-nevo-near-black/60">
              Before you do
            </span>
            <ul className="m-0 list-none space-y-2 p-0 text-[13.5px] leading-[1.55] text-nevo-near-black/70">
              {/*
                * THE CONSEQUENCE FIRST. This endpoint resets rather than
                * reveals, so issuing one to "have a look" locks out a child
                * who was managing fine. Saying it here is what makes the
                * confirm step worth having.
                */}
              <li>
                {firstName}&rsquo;s current PIN stops working straight away.
              </li>
              <li>
                They won&rsquo;t be able to sign in until you&rsquo;ve given
                them the new one.
              </li>
              <li>Nothing else about their account or their learning changes.</li>
            </ul>
          </div>
        </>
      )}
    </Sheet>
  );
}
