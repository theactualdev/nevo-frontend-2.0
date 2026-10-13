"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { readContact, schoolApi, type School } from "@/lib/api/school";
import { cn } from "@/lib/utils";
import { CheckIcon, Spinner } from "../Roster/primitives";
import {
  StepHeading,
  WIZARD_PRIMARY,
  type WizardState,
} from "./OnboardingWizard";

/**
 * D1.5, the last onboarding step: the handover to the dashboard.
 *
 * ONE SCREEN NOW. It used to be two, chosen by the sign-in method asked
 * earlier; that question is cut from onboarding (Lydia, 7 Oct) and its home
 * is IT & SSO, so the provider branch went with it. The school code is not
 * handed over here either - it lives on the Overview (see below).
 */

type Phase = "loading" | "ready" | "failed";

export function HandoverStep({ state }: { state: WizardState }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [school, setSchool] = useState<School | null>(null);

  const load = useCallback(() => {
    schoolApi
      .get()
      .then((s) => {
        setSchool(s);
        setPhase("ready");
        // Mark the wizard finished, so a resumed session knows not to restart
        // it. Best effort: a failure here must not block the workspace.
        schoolApi
          .saveOnboarding({ completedAt: new Date().toISOString() })
          .catch(() => undefined);
      })
      .catch(() => setPhase("failed"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const schoolName = school?.name || state.schoolName.trim() || "Your school";
  /** Typed at sign-up, and not on the school's record. */
  const locationMissing =
    Boolean(state.location.trim()) && school !== null && !readContact(school).location;

  if (phase === "loading") {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Spinner />
        <p className="m-0 text-sm text-nevo-near-black/60">
          Finishing your workspace…
        </p>
      </div>
    );
  }

  return (
    <>
      {/* THE ONE MOMENT OF WARMTH IN THE FLOW. A head teacher has just given
          Nevo their school's name and accepted the DPA; the last screen marks
          that it landed, not read like another form. */}
      <span
        aria-hidden="true"
        className="mx-auto mb-5 flex size-[52px] items-center justify-center rounded-full bg-nevo-navy text-nevo-cream motion-safe:animate-nevo-pop"
      >
        <CheckIcon size={22} />
      </span>
      {/*
        * WHAT HAS NOT HAPPENED, SAID PLAINLY (Lydia, 7 Oct). This read "You're
        * all set up ... Share your school code so staff and students can
        * join" to a school that has not paid - and nothing behind that code
        * works until it has. The title is D24's own; the line is the ruling's.
        */}
      <StepHeading
        title={`${schoolName} isn't active yet`}
        sub="No accounts have been created, no invitations have gone out and no consent requests have been sent. All of it happens when your transfer clears."
      />

      {/*
        * ~~THE SCHOOL CODE WAS HANDED OVER HERE.~~ IT MOVED, 24 Sep.
        *
        * D01's own caption: *"the school code now lives on the dashboard
        * overview"*, and D24's activation screen shows it there. Design's
        * reasoning is the part to keep: *"a code handed over once at the end of
        * onboarding is a code the school loses the moment they close the tab."*
        *
        * It renders on the Overview now - see `SchoolCodeCard`, which went in
        * BEFORE this came out. The code was on exactly two screens, and the
        * other one is the IT home, which came off the sidebar the same day.
        * Removing this first would have left a manual school - every school
        * right now - with no way to find the code its staff sign in with.
        */}

      {/* The location typed at sign-up is written after sign-in and never
          holds the flow up - so if it is not on the school's record, this is
          where that is said, rather than the field quietly coming up empty in
          Settings later. */}
      {locationMissing ? (
        <p className="mt-6 rounded-[10px] bg-nevo-violet/[0.18] px-4 py-3.5 text-[13.5px] leading-[1.55] text-nevo-navy">
          We couldn&rsquo;t save your school&rsquo;s location. You can add it
          in{" "}
          <Link href="/admin/settings#settings-school" className="font-semibold underline">
            Settings
          </Link>
          .
        </p>
      ) : null}

      <Link href="/admin/dashboard" className={cn(WIZARD_PRIMARY, "mt-9 block text-center")}>
        Go to your dashboard
      </Link>
    </>
  );
}
