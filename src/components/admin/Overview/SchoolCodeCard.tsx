"use client";

import { useEffect, useState } from "react";
import { schoolApi, type School } from "@/lib/api/school";
import { cn } from "@/lib/utils";
import { CARD } from "../Roster/primitives";
import { failureKind } from "../NoAccess";
import { CardUnread } from "./CardUnread";

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
 * code" over an empty space is worse than no card.
 *
 * A FAILED READ IS NOT THAT ABSENCE (backlog 33). It used to be, on the
 * reasoning that this card never says a school has no code - but a card that
 * vanishes says nothing either, and SCRUM-39 says a card that cannot load
 * tells you so, with Try again. So it keeps its heading, says it couldn't
 * pull the code in, and never says there isn't one.
 */
export function SchoolCodeCard() {
  const [school, setSchool] = useState<School | null>(null);
  const [copied, setCopied] = useState(false);
  /** The read failed - which is not "no code". A 403 stays silent. */
  const [failed, setFailed] = useState(false);
  /** Bumped by Try again, to read the school again. */
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    schoolApi
      .get()
      .then((s) => {
        setSchool(s);
        setFailed(false);
      })
      .catch((err: unknown) => {
        setSchool(null);
        setFailed(failureKind(err) !== "denied");
      });
  }, [attempt]);

  if (failed) {
    return (
      <div className={cn(CARD, "mt-5 px-5 py-[15px]")}>
        <h3 className="m-0 text-[11.5px] font-semibold tracking-[0.05em] text-nevo-near-black/50 uppercase lg:text-[12px]">
          School code
        </h3>
        <CardUnread className="mt-2" onRetry={() => setAttempt((a) => a + 1)} />
      </div>
    );
  }

  const code = school?.code;
  if (!code) return null;

  /*
   * D04'S ROW, VALUE FOR VALUE (QA, 10 Oct): "School code" over the code in
   * monospace, weight 600, 22px (19px below 1024), 0.12em tracking, navy; a
   * plain "Copy" beside it; the sentence on the right. This was a taller card
   * with the code at 28px regular, 0.18em, near-black, and a bordered button.
   *
   * LINES, NEVER BOXES. The house rule, and it carries meaning: codes are
   * lines and PINs are boxes, so a child never confuses the two.
   */
  return (
    <div
      className={cn(
        CARD,
        "mt-5 flex flex-wrap items-center gap-[18px] px-5 py-[15px]",
      )}
    >
      <div className="min-w-0 flex-auto">
        <h3 className="m-0 text-[11.5px] font-semibold tracking-[0.05em] text-nevo-near-black/50 uppercase lg:text-[12px]">
          School code
        </h3>
        <div className="mt-1 flex items-center gap-[11px] lg:mt-[5px] lg:gap-3">
          <p className="m-0 font-mono text-[19px] font-semibold tracking-[0.12em] text-nevo-navy lg:text-[22px]">
            {code}
          </p>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard
                ?.writeText(code)
                .then(() => setCopied(true))
                /*
                 * A refused clipboard is not a copied code. Saying "Copied"
                 * when the browser declined would send somebody to paste
                 * nothing - the code is on screen either way, so the honest
                 * failure costs them a retype rather than a mystery.
                 */
                .catch(() => setCopied(false));
            }}
            aria-label={copied ? "Copied" : "Copy school code"}
            className="cursor-pointer rounded-sm text-[12.5px] font-semibold text-nevo-navy hover:opacity-75 lg:text-[13px]"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <p className="m-0 max-w-[360px] text-[13px] leading-normal text-nevo-near-black/60">
        Share this so staff and students can join. It also lives under IT
        &amp; SSO.
      </p>
    </div>
  );
}
