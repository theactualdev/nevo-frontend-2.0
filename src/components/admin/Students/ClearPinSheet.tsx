"use client";

import { useState } from "react";
import { studentsApi } from "@/lib/api/students";
import { cn } from "@/lib/utils";
import {
  FailureLine,
  GHOST_BTN,
  PRIMARY_BTN,
  Sheet,
  Spinner,
} from "../Roster/primitives";

/**
 * Clear a child's PIN so they choose a new one themselves, for D7b.
 *
 * THE OTHER END OF "ASK YOUR TEACHER". A locked-out child's Forgot PIN screen
 * sends them to an adult - *"Your teacher can clear your old PIN, and then
 * you'll choose a new one yourself"* - and this is the admin's control for it.
 *
 * A CLEAR, NOT A RESET (SCRUM-216). This sheet used to issue a PIN and show it
 * once, so an adult both chose a child's credential and knew it. The endpoint
 * that did that is gone. `POST /students/{id}/pin/clear` never accepts, returns
 * or generates a PIN, so there is nothing here to show, copy or hand over -
 * and the child, not the adult, picks the next one, at their next sign-in.
 *
 * IT CONFIRMS BEFORE IT CALLS. The teacher frame (C05) clears straight from a
 * row's menu; this is a sheet opened from the student's page, and the clear is
 * not free. The old PIN stops working, and the server ends every session the
 * child has, so a child mid-lesson is signed out. Both are said before the
 * button, so nobody clears a PIN to "check" one.
 *
 * The done state is the teacher frame's own words, so a school hears the same
 * thing from either console.
 */

type Phase = "confirm" | "clearing" | "cleared" | "failed";

export function ClearPinSheet({
  studentId,
  studentName,
  onClose,
}: {
  studentId: string;
  studentName: string;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("confirm");

  const firstName = studentName.split(" ").filter(Boolean)[0] ?? studentName;

  const clear = () => {
    setPhase("clearing");
    studentsApi
      .clearPin(studentId)
      .then(() => setPhase("cleared"))
      .catch(() => setPhase("failed"));
  };

  return (
    <Sheet
      busy={phase === "clearing"}
      title={
        phase === "cleared"
          ? `${firstName}'s PIN is cleared`
          : `Clear ${firstName}'s PIN`
      }
      subtitle={
        phase === "cleared"
          ? undefined
          : "Use this when they can't get in and can't remember theirs."
      }
      onClose={onClose}
      footer={
        phase === "clearing" ? (
          <div className="flex flex-1 items-center justify-center gap-2.5 py-3">
            <Spinner />
            <span className="text-sm text-nevo-near-black/60">
              Clearing the PIN&hellip;
            </span>
          </div>
        ) : phase === "cleared" ? (
          /* One way out. "Cancel" would be a lie beside a clear that has
             already happened. */
          <button
            type="button"
            onClick={onClose}
            className={cn(PRIMARY_BTN, "flex-1 justify-center")}
          >
            Done
          </button>
        ) : phase === "failed" ? (
          <>
            <FailureLine>
              That didn&rsquo;t go through, so {firstName}&rsquo;s PIN
              hasn&rsquo;t changed. They can still use their old one.
            </FailureLine>
            <button type="button" onClick={clear} className={PRIMARY_BTN}>
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
              onClick={clear}
              className={cn(PRIMARY_BTN, "flex-1 justify-center")}
            >
              Clear PIN
            </button>
            <button type="button" onClick={onClose} className={GHOST_BTN}>
              Cancel
            </button>
          </>
        )
      }
    >
      {phase === "cleared" ? (
        <>
          <p className="m-0 text-[13.5px] leading-[1.55] text-nevo-near-black/70">
            {firstName} chooses a new PIN at the next sign-in.
          </p>
          <p className="m-0 text-[13.5px] leading-[1.55] text-nevo-near-black/70">
            You won&rsquo;t be able to see the new PIN. Only {firstName} will
            know it.
          </p>
        </>
      ) : (
        <>
          <p className="m-0 text-[13.5px] leading-[1.55] text-nevo-near-black/70">
            We&rsquo;ll clear {firstName}&rsquo;s PIN, and they&rsquo;ll choose
            a new one themselves. Nobody else sees it, including you.
          </p>

          <div>
            <span className="mb-[7px] block text-[12.5px] font-semibold text-nevo-near-black/60">
              Before you do
            </span>
            <ul className="m-0 list-none space-y-2 p-0 text-[13.5px] leading-[1.55] text-nevo-near-black/70">
              {/*
                * THE CONSEQUENCE FIRST. The server ends every session the child
                * has as it clears, so a child signed in right now is signed
                * out - worth knowing before pressing, not after.
                */}
              <li>
                {firstName}&rsquo;s current PIN stops working straight away, and
                they&rsquo;re signed out anywhere they&rsquo;re signed in.
              </li>
              <li>They choose a new one the next time they sign in.</li>
              <li>Nothing else about their account or their learning changes.</li>
            </ul>
          </div>
        </>
      )}
    </Sheet>
  );
}
