"use client";

import { useEffect, useRef, useState } from "react";
import { schoolApi } from "@/lib/api/school";
import { DPA_BADGE, DPA_VERSION, DPA_VERSION_LINE, dpaFor } from "@/lib/mocks/dpa";
import { cn } from "@/lib/utils";
import { CheckIcon, Spinner } from "../Roster/primitives";
import { StepHeading, WIZARD_PRIMARY, WIZARD_SECONDARY } from "./OnboardingWizard";

/**
 * D1.3 Data processing agreement - and THE GATE IS REAL.
 *
 * A Nigerian school proprietor and a UK SENCo both need to see the whole
 * agreement, in the product, before agreeing. So: the DPA renders in full,
 * inline. No modal, no external link, no download-to-continue. The accept
 * checkbox stays disabled until the scroll container reaches its bottom, and
 * nothing auto-checks or auto-advances when it does.
 *
 * The pane scrolls INSIDE ITSELF - the page does not scroll behind it - and no
 * button position depends on the document's length, because counsel's final
 * wording will be longer than this placeholder.
 *
 * THE VERSION IS STORED, NOT ASSUMED. `DPA_VERSION` travels with the
 * acceptance, because D12 and the D22 NDPA compliance surface later display
 * which version a school actually agreed to. If the words change and the
 * version does not, that record silently becomes a lie.
 *
 * THE ACCEPTANCE IS NOW A REAL RECORD (backend, 7 Sep).
 * `POST /api/v1/school/dpa-acceptance` takes the version and stores the
 * document version, the accepting administrator and the timestamp - so D12 and
 * D22 can say which version a school agreed to, and WHO agreed. It used to go
 * into `profile.onboarding` as an untyped blob with no admin id, which was the
 * worst-kept of the three things this wizard stored precisely because it is a
 * compliance record of an agreement a school signed.
 *
 * TODO(api): SCRUM-39 also asks for `GET dpa {version, html}` so the TEXT comes
 * from the server. It does not exist, so the wording is still local and still
 * marked placeholder - counsel has not returned final copy.
 */

type Phase = "idle" | "saving" | "failed";

export function DpaStep({
  schoolName,
  onBack,
  onDone,
}: {
  schoolName: string;
  /**
   * Optional: the console's own agreement gate (`Shell/DpaGate`) has no step
   * before this one to go back to.
   */
  onBack?: () => void;
  onDone: () => void;
}) {
  const [readToEnd, setReadToEnd] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [notAccepted, setNotAccepted] = useState(false);
  const pane = useRef<HTMLDivElement>(null);

  const clauses = dpaFor(schoolName);

  // A pane shorter than its container never scrolls, so it would never
  // unlock. Measure once on mount and treat "nothing to scroll" as read.
  useEffect(() => {
    const el = pane.current;
    if (!el) return;
    const t = setTimeout(() => {
      if (el.scrollHeight <= el.clientHeight + 4) setReadToEnd(true);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const onScroll = () => {
    const el = pane.current;
    if (!el || readToEnd) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setReadToEnd(true);
  };

  const accept = () => {
    // Design's ruling (7 Sep): tapping Continue unticked shows an inline
    // message rather than silently doing nothing. That required ENABLING the
    // button - it was `disabled={!accepted}`, so the tap could never happen and
    // an admin was stuck with no explanation, which screen readers skip
    // entirely. The read-to-end gate stays hard: a school has to be able to
    // read the agreement before agreeing to it.
    if (!accepted) {
      setNotAccepted(true);
      return;
    }
    setNotAccepted(false);
    setPhase("saving");
    // The typed record, not the profile blob. The backend stamps the admin and
    // the time from the session, so neither is sent - and neither can drift.
    schoolApi
      .acceptDpa(DPA_VERSION)
      .then(() => onDone())
      .catch(() => setPhase("failed"));
  };

  return (
    <>
      <StepHeading
        title="How we handle your students' data"
        sub="The full agreement, in plain sections. Read it through; the box below unlocks at the end."
      />

      <p className="mt-4 inline-block rounded-full bg-nevo-violet/24 px-3 py-1 text-[11.5px] font-semibold text-nevo-navy">
        {DPA_BADGE}
      </p>

      <div className="relative mt-4">
        <div
          ref={pane}
          onScroll={onScroll}
          tabIndex={0}
          className="max-h-[420px] overflow-y-auto rounded-xl bg-nevo-cream-elevated px-7 py-[26px] outline-none max-lg:max-h-[340px]"
        >
          {clauses.map((c) => (
            <section key={c.num} className="mb-6 last:mb-0">
              <h2 className="m-0 text-[15px] font-semibold text-nevo-navy">
                {c.num} · {c.title}
              </h2>
              <p className="m-0 mt-2 text-[14.5px] leading-[1.7] text-nevo-near-black/80">
                {c.body}
              </p>
            </section>
          ))}
          <p className="m-0 mt-8 text-center text-[12.5px] text-nevo-near-black/45">
            &mdash; End of agreement &mdash;
          </p>
          <p className="m-0 mt-2 text-center text-[12px] text-nevo-near-black/40">
            {DPA_VERSION_LINE}
          </p>
        </div>

        {!readToEnd ? (
          <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-nevo-near-black/70 px-3 py-1.5 text-[12px] font-medium text-nevo-cream">
            Keep reading
          </span>
        ) : null}
      </div>

      <div className="mt-5 flex items-start gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={accepted}
          disabled={!readToEnd}
          onClick={() => {
            setAccepted((v) => !v);
            setNotAccepted(false);
          }}
          className={cn(
            "mt-0.5 flex size-5 flex-none items-center justify-center rounded-[5px] border transition-colors",
            !readToEnd
              ? "cursor-default border-nevo-near-black/16"
              : accepted
                ? "cursor-pointer border-nevo-navy bg-nevo-navy text-nevo-cream"
                : "cursor-pointer border-nevo-navy/50",
          )}
        >
          {accepted ? <CheckIcon size={12} /> : null}
        </button>
        <label
          onClick={() => {
            if (!readToEnd) return;
            setAccepted((v) => !v);
            setNotAccepted(false);
          }}
          className={cn(
            "text-sm leading-[1.55]",
            readToEnd
              ? "cursor-pointer text-nevo-near-black/80"
              : "text-nevo-near-black/40",
          )}
        >
          I&rsquo;ve read this and I agree on behalf of{" "}
          {schoolName.trim() || "my school"}.
        </label>
      </div>

      {!readToEnd ? (
        <p className="mt-2 pl-8 text-[12.5px] text-nevo-near-black/50">
          Scroll to the end of the agreement to continue.
        </p>
      ) : notAccepted ? (
        /* Inline, under the checkbox - no modal, no toast. Violet is the
           alert colour here; the palette has no alarm colours. */
        <p
          role="alert"
          className="mt-2 pl-8 text-[12.5px] font-medium text-nevo-navy"
        >
          Please accept the agreement to continue.
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => window.print()}
        className="mt-3 cursor-pointer pl-8 text-[13px] font-semibold text-nevo-navy hover:opacity-75"
      >
        Save a copy
      </button>

      {phase === "failed" ? (
        <p className="mt-5 rounded-[10px] bg-nevo-violet/[0.18] px-4 py-3.5 text-[13.5px] leading-[1.55] text-nevo-navy">
          That didn&rsquo;t record, so nothing has been agreed yet. We&rsquo;re
          on it - try again in a moment.
        </p>
      ) : null}

      <div className="mt-8 flex flex-col gap-2.5">
        <button
          type="button"
          onClick={accept}
          disabled={!readToEnd || phase === "saving"}
          className={WIZARD_PRIMARY}
        >
          {phase === "saving" ? (
            <span className="inline-flex items-center justify-center gap-2.5">
              <Spinner />
              Recording your agreement…
            </span>
          ) : (
            "Continue"
          )}
        </button>
        {onBack ? (
          <button type="button" onClick={onBack} className={WIZARD_SECONDARY}>
            Back
          </button>
        ) : null}
      </div>
    </>
  );
}
