"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, IllustrationWrapper } from "@/components/shared";
import { ApiError, authApi } from "@/lib/api";
import { BUSY_PHASE, BUSY_REASON, SIGNAL_EVENT_TYPES } from "@/lib/constants";
import { useSignals } from "@/hooks";
import { mergeOnboardingDraft } from "@/lib/auth/onboarding";
import { randomId } from "@/lib/utils";
import { OnboardingShell } from "./OnboardingShell";
import {
  CodeInput,
  SCHOOL_CODE_MAX,
  SCHOOL_CODE_MIN,
  codeIsEnterable,
  type CodeStatus,
} from "./CodeInput";

const NEXT_STEP = "/student/onboarding/class";

/**
 * Onboarding Step 2 — School Connection (UI/UX spec B.2 Step 2). Identifies the
 * school via code entry: the child submits a code, it validates, and then it
 * either confirms + auto-advances or shows a warm-toned (non-alarming) error.
 * The validation wait is the system's, bracketed as `system_busy` (SCRUM-94 fix
 * 9) via a short-lived signal session (no onboarding session exists yet here).
 *
 * THE CODE IS SENT AS TYPED. This used to post `NEVO-${entered}` against a
 * four-character field, so the only codes it could express were four characters
 * behind a prefix - and real ones are neither (`751A1136` from our own E2E
 * tenant, `BGA-4827`). `SchoolCodeRequest` is an exact 2-50 character lookup,
 * so nothing on the server could rescue a code we had reshaped. Every entrance
 * to the product funnels through this screen, which made a prefix nobody uses
 * the reason no child could get in.
 */
export function SchoolConnectionStep() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<CodeStatus>("idle");
  // A school that does not exist and a check we could not run are different
  // sentences, and a child should never wonder if they mistyped when we
  // failed. Both render in the same warm error styling.
  const [trouble, setTrouble] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // A bare UUID and `onboarding` - see `ObservedInteractionSequence`, which
  // had the same prefix and the same fate: never a UUID, read as a lesson
  // stream with no lesson, and held until the screen went.
  const [signalSession] = useState(() => randomId());
  const { trackEvent } = useSignals(signalSession, undefined, "onboarding");

  useEffect(() => {
    const active = timers.current;
    return () => active.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (status !== "pending") return;
    trackEvent(SIGNAL_EVENT_TYPES.SYSTEM_BUSY, {
      reason: BUSY_REASON.CONTENT_LOADING,
      phase: BUSY_PHASE.START,
    });
    return () =>
      trackEvent(SIGNAL_EVENT_TYPES.SYSTEM_BUSY, {
        reason: BUSY_REASON.CONTENT_LOADING,
        phase: BUSY_PHASE.END,
      });
  }, [status, trackEvent]);

  const reset = () => {
    timers.current.forEach(clearTimeout);
    // EMPTIED, NOT REPLACED. The unmount effect above captures this array at
    // mount to satisfy `react-hooks/exhaustive-deps`, so assigning a new one
    // here left it holding the old, empty array - and the 900ms advance timer
    // scheduled after any keystroke was then never cleared. A child who typed a
    // code, got a match, and went back within that beat was dragged forward to
    // the class step anyway, from a component that had already unmounted.
    timers.current.length = 0;
  };

  const handleChange = (next: string) => {
    reset();
    setStatus("idle");
    setTrouble(false);
    setCode(next);
  };

  const handleSubmit = (entered: string) => {
    if (!codeIsEnterable(entered, SCHOOL_CODE_MIN) || status === "pending")
      return;
    setStatus("pending");
    setTrouble(false);
    // As typed. The code belongs to the school, not to our input field.
    const schoolCode = entered.trim();
    void authApi.verifySchoolCode(schoolCode).then(
      (school) => {
        setStatus("success");
        // Remember what the school told us: the code (the live login needs
        // it), the name, how its students sign in, and its class list -
        // which is exactly what the next step confirms against.
        mergeOnboardingDraft({
          schoolCode,
          schoolName: school.schoolName,
          authMethod: school.authMethod,
          classes: school.classes.map((c) => ({ id: c.id, name: c.name })),
        });
        timers.current.push(setTimeout(() => router.push(NEXT_STEP), 900));
      },
      (err: unknown) => {
        // 4xx is the server's answer about the code; anything else is ours.
        const notFound =
          err instanceof ApiError && err.status >= 400 && err.status < 500;
        setTrouble(!notFound);
        setStatus("error");
      },
    );
  };

  const message =
    status === "success"
      ? {
          text: "That's a match - connecting you to your school…",
          className: "text-nevo-navy",
        }
      : status === "error"
        ? {
            text: trouble
              ? "We couldn't check that just now. Give it a moment and try again."
              : "That code doesn't match a school. Check it with your teacher.",
            // A child cannot act on a message they cannot read.
            className: "text-nevo-violet-text",
          }
        : null;

  return (
    <OnboardingShell step={2} backHref="/student/onboarding/name">
      <div className="flex justify-center">
        <IllustrationWrapper
          src="/illustrations/onboarding-school.png"
          alt="A friendly figure holding up a school card"
          width={671}
          height={963}
          priority
          className="mt-1 w-[98px] sm:mt-5 sm:w-[130px] lg:mt-3 lg:w-[148px]"
        />
      </div>

      <h2 className="mt-5 text-lg font-medium leading-[1.25] tracking-[-0.01em] text-nevo-near-black sm:mt-8 sm:text-[23px] lg:mt-[26px] lg:text-[22px]">
        Do you have a code from your school?
      </h2>

      <div className="mt-7">
        <CodeInput
          value={code}
          onChange={handleChange}
          onSubmit={handleSubmit}
          status={status}
          label="School code"
          placeholder="Type your school code"
          min={SCHOOL_CODE_MIN}
          max={SCHOOL_CODE_MAX}
        />
      </div>

      <div className="mt-3 min-h-[22px]">
        {message && (
          <p className={`text-sm leading-[1.4] ${message.className}`}>
            {message.text}
          </p>
        )}
      </div>

      {/* One button doing the honest thing at each stage: it checks the code,
          and once a school has answered to it, it moves on. It used to be
          Continue alone, disabled until a success that could not arrive
          because the code being checked was one the child had not typed. */}
      <Button
        onClick={() =>
          status === "success" ? router.push(NEXT_STEP) : handleSubmit(code)
        }
        disabled={
          status === "pending" ||
          (status !== "success" && !codeIsEnterable(code, SCHOOL_CODE_MIN))
        }
        className="mt-7 w-full sm:mt-8"
      >
        {status === "success" ? "Continue" : "Check my code"}
      </Button>
    </OnboardingShell>
  );
}
