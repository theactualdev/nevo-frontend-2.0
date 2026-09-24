"use client";

import { useEffect, useState } from "react";
import { schoolApi, type School } from "@/lib/api/school";
import { cn } from "@/lib/utils";
import { CARD } from "../Roster/primitives";

/**
 * The school's join code, on the dashboard where D01 says it now lives.
 *
 * WHY IT MOVED. The code used to be handed over once, on the last step of the
 * onboarding wizard. D01's own caption settles it - *"the school code now
 * lives on the dashboard overview"* - and D24's activation screen says the
 * same. Design's reasoning is the part worth keeping: *"a code handed over
 * once at the end of onboarding is a code the school loses the moment they
 * close the tab."*
 *
 * WHY THIS CARD EXISTS BEFORE THAT REMOVAL, AND NOT AFTER IT. The code was on
 * exactly two screens: the wizard's last step, and the IT home - which came off
 * the sidebar the same day, because provider sign-in is deferred. Taking it out
 * of the wizard first would have left a manual school with no way to find the
 * code its staff and students sign in with, which is every school right now.
 *
 * ABSENT RATHER THAN BLANK when there is no code. `School.code` is nullable -
 * it is null for a provider-connected school - and a card headed "Your school
 * code" over an empty space is worse than no card. A failed read is the same
 * absence for the same reason: this card never says a school has no code.
 */
export function SchoolCodeCard() {
  const [school, setSchool] = useState<School | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    schoolApi
      .get()
      .then(setSchool)
      // Silent. A school that cannot be read has not lost its code, and this
      // card is not the place to report that the school record is unreachable.
      .catch(() => setSchool(null));
  }, []);

  const code = school?.code;
  if (!code) return null;

  return (
    <div className={cn(CARD, "mt-5 px-[26px] py-[22px]")}>
      <h3 className="m-0 text-[13px] font-semibold tracking-[0.05em] text-nevo-near-black/50 uppercase">
        Your school code
      </h3>
      <div className="mt-2 flex flex-wrap items-center gap-4">
        {/*
          * LINES, NEVER BOXES. The house rule, and it carries meaning: codes
          * are lines and PINs are boxes, so a child never confuses the two.
          * Same treatment the wizard's handover used.
          */}
        <p className="m-0 font-mono text-[28px] tracking-[0.18em] text-nevo-near-black">
          {code}
        </p>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard
              ?.writeText(code)
              .then(() => setCopied(true))
              /*
               * A refused clipboard is not a copied code. Saying "Copied" when
               * the browser declined would send somebody to paste nothing -
               * the code is on screen either way, so the honest failure costs
               * them a retype rather than a mystery.
               */
              .catch(() => setCopied(false));
          }}
          className="h-[38px] cursor-pointer rounded-[10px] border border-nevo-navy/30 px-4 text-[13.5px] font-semibold text-nevo-navy transition-colors hover:bg-nevo-navy/[0.06]"
        >
          {copied ? "Copied" : "Copy code"}
        </button>
      </div>
      <p className="m-0 mt-2.5 max-w-[56ch] text-[13px] leading-[1.55] text-nevo-near-black/58">
        Share it so staff and students can join.
      </p>
    </div>
  );
}
