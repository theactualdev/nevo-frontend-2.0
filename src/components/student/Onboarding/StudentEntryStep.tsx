"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import {
  Button,
  IllustrationWrapper,
  NevoKeyboard,
  useNevoKeyboardDock,
} from "@/components/shared";
import { ConsentWithdrawn } from "@/components/student/Entry/ConsentWithdrawn";
import {
  WaitingOnConsent,
  type WaitingHold,
} from "@/components/student/Entry/WaitingOnConsent";
import { useSignals } from "@/hooks";
import { ApiError } from "@/lib/api/client";
import {
  studentEntryApi,
  type StudentEntryState,
} from "@/lib/api/studentEntry";
import { entryRoute } from "@/lib/auth/entryGate";
import {
  clearOnboardingDraft,
  startOnboardingDraft,
} from "@/lib/auth/onboarding";
import { SCHOOL_CODE_LENGTH, placeSchoolCode } from "@/lib/auth/schoolCode";
import { handSignInOver } from "@/lib/auth/signInHandoff";
import { BUSY_REASON } from "@/lib/constants";
import { openBusyWindow } from "@/lib/signals/busy";
import { cn, randomId } from "@/lib/utils";
import { OnboardingShell } from "./OnboardingShell";

/** The Welcome, where both doors into this screen live. */
const WELCOME = "/student/onboarding";
/** The transition into 08 Profiling Intro. */
const FIRST_RUN = "/student/onboarding/sequence";
/** 00c, for a child who already has an account. */
const SIGN_BACK_IN = "/auth/sign-in";

/** `StudentEntryLookup.admissionNumber` is 1-60 characters. */
const ADMISSION_NUMBER_MAX = 60;

/** The frame's beat on "Found you - one moment…" before moving on. */
const MATCH_BEAT_MS = 900;

type Status = "idle" | "pending" | "success" | "error";
/** A code cell by index, or the Student ID field. */
type Field = number | "id";

/**
 * Which door brought the child: "I have a school code" (05), or "I'm joining
 * through my teacher" (03). Same screen, same lookup; only the words change.
 */
export type EntryFraming = "school" | "teacher";

/** The frame's words for each door. */
const FRAMING: Record<EntryFraming, { heading: string; sub: string }> = {
  school: {
    heading: "Find your school",
    sub: "Your school gives you both of these.",
  },
  teacher: {
    heading: "Join your school",
    sub: "Your teacher will read out the school code.",
  },
};

export const ENTRY_MATCHED_COPY = "Found you - one moment…";
/**
 * NEVER SAYS WHICH FIELD WAS WRONG, or whether the ID exists. A screen that
 * says "that school code is right but the ID is not" tells anyone holding a
 * tablet which admission numbers are real at a school, and they are often
 * sequential.
 */
export const ENTRY_NO_MATCH_COPY =
  "That didn't match. Check both with your teacher and try again.";
/**
 * The frame's "unreachable" state (29af2a4), for a lookup we could not run.
 * Saying "that didn't match" over a dropped network would send a child to
 * their teacher to re-check two things that were right - so this says they
 * were not wrong, the fields keep their ordinary border, and the button stays
 * "Continue". Only a real miss tints the fields and reads "Try again".
 */
export const ENTRY_UNCHECKED_COPY =
  "We couldn't check just now. Nothing you typed is wrong - press Continue to try again.";

/**
 * Did the server answer about the pair, rather than fail to answer?
 *
 * The spec declares only the 200 and a 422, so what an unmatched pair gets is
 * not written down. Any 4xx is read as the server's answer about what was
 * typed; a 5xx, a dropped network and a 429 say nothing about it.
 */
function answeredAboutThePair(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    err.status >= 400 &&
    err.status < 500 &&
    err.status !== 429
  );
}

/**
 * 05 Entry and 03 Teacher Join - one screen that identifies which child has
 * arrived (SCRUM-208, design 30 Sep; frame "Nevo Student Entry Frame").
 *
 * TWO FIELDS, ONE CONTINUE. The school code first, because a Student ID is
 * only unique within one school, then the Student ID / Admission Number. Name,
 * age and class are never asked: the lookup reads them off the roster row the
 * school already uploaded. It replaced three screens - name and age, school
 * code, class - and the class code and QR doors beside them.
 *
 * THE CODE IS FOUR CELLS (D6). Typed characters are upper-cased and filtered
 * to the code's alphabet, and each one moves on to the next cell, then to the
 * ID. Backspace in an empty cell goes back one. A pasted code spreads across
 * the cells.
 *
 * ON A MATCH it shows the frame's "Found you" beat, then routes on the child's
 * state, decided in one place (`entryRoute`): held at 00d, 00e or the age check,
 * sent to sign back in, or on into the first run. A held child is held HERE,
 * in place: they have no session, so `/student/waiting` would bounce them to
 * the PIN door, and the address they are on says nothing about why.
 *
 * A MISS keeps both values as typed and turns Continue into "Try again". It
 * never says which field was wrong. A lookup we could not run is not a miss:
 * it says nothing typed is wrong, and leaves the fields and Continue alone.
 *
 * The keyboard docks on focus (touch only), as the frame draws it, and the
 * illustration makes way for it.
 */
export function StudentEntryStep({ framing }: { framing: EntryFraming }) {
  const router = useRouter();
  const [code, setCode] = useState<string[]>(() =>
    Array.from({ length: SCHOOL_CODE_LENGTH }, () => ""),
  );
  const [admissionNumber, setAdmissionNumber] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  /**
   * A lookup we could not run, versus a pair that matched nobody. A child must
   * never be told to re-check what they typed because our request failed.
   */
  const [trouble, setTrouble] = useState(false);
  /**
   * Matched, and held - by consent that has not come, by consent that has
   * gone (00e, D117), or by the age check - drawn in place.
   */
  const [held, setHeld] = useState<WaitingHold | "withdrawn" | null>(null);

  const cellRefs = useRef<(HTMLInputElement | null)[]>([]);
  const idRef = useRef<HTMLInputElement>(null);
  /** The field the on-screen keyboard types into - the last one focused. */
  const active = useRef<Field | null>(null);
  const pad = useNevoKeyboardDock();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const alive = useRef(true);

  // A bare UUID and `onboarding`: the ingest contract declares the id a UUID,
  // and a stream that says nothing about itself is read as a lesson stream.
  const [signalSession] = useState(() => randomId());
  const { trackEvent } = useSignals(signalSession, undefined, "onboarding");

  useEffect(() => {
    alive.current = true;
    const pending = timers.current;
    return () => {
      alive.current = false;
      pending.forEach(clearTimeout);
    };
  }, []);

  // The lookup's wait is the system's, not the child's (SCRUM-94 fix 9).
  useEffect(() => {
    if (status !== "pending") return;
    return openBusyWindow(trackEvent, BUSY_REASON.CONTENT_LOADING);
  }, [status, trackEvent]);

  /** Checking, or matched and on the way out: what was typed is settled. */
  const locked = status === "pending" || status === "success";
  const schoolCode = code.join("");
  const id = admissionNumber.trim();
  const ready = schoolCode.length === SCHOOL_CODE_LENGTH && id.length > 0;

  /** Any change to what was typed makes the last answer stale. */
  const edited = () => {
    setStatus("idle");
    setTrouble(false);
  };

  const focusField = (field: Field) => {
    if (field === "id") idRef.current?.focus();
    else cellRefs.current[field]?.focus();
  };

  const typeIntoCell = (i: number, raw: string) => {
    if (locked) return;
    if (raw === "") {
      if (!code[i]) return;
      const next = code.slice();
      next[i] = "";
      setCode(next);
      edited();
      return;
    }
    const placed = placeSchoolCode(code, i, raw);
    // A 0, an O or a symbol: nothing belongs in the code, so nothing moves.
    if (placed.last === null) return;
    setCode(placed.cells);
    edited();
    focusField(placed.last < SCHOOL_CODE_LENGTH - 1 ? placed.last + 1 : "id");
  };

  const backspaceCell = (i: number) => {
    if (locked) return;
    const at = code[i] ? i : i - 1;
    if (at < 0) return;
    const next = code.slice();
    next[at] = "";
    setCode(next);
    edited();
    if (at !== i) focusField(at);
  };

  const typeIntoId = (raw: string) => {
    if (locked) return;
    // Upper-cased in the value, not only on screen: what is sent is what the
    // child sees, and the keyboard's one-shot shift would otherwise send
    // "Bga/2031" under a field that shows "BGA/2031".
    setAdmissionNumber(
      raw.trimStart().toUpperCase().slice(0, ADMISSION_NUMBER_MAX),
    );
    edited();
  };

  const onward = (
    state: StudentEntryState,
    matchedCode: string,
    matchedNumber: string,
  ) => {
    switch (entryRoute(state)) {
      case "waiting":
        // Nothing of theirs is kept: a held child is not onboarding.
        clearOnboardingDraft();
        setHeld("consent");
        return;
      case "withdrawn":
        clearOnboardingDraft();
        setHeld("withdrawn");
        return;
      case "age-check":
        clearOnboardingDraft();
        setHeld("age-check");
        return;
      case "sign-in":
        clearOnboardingDraft();
        handSignInOver({ schoolCode: matchedCode, identifier: matchedNumber });
        router.push(SIGN_BACK_IN);
        return;
      case "first-run":
        // A NEW DRAFT, not a merge: nothing an earlier child left in this tab
        // comes with them.
        startOnboardingDraft({
          schoolCode: matchedCode,
          admissionNumber: matchedNumber,
          name: state.firstName,
          ...(typeof state.age === "number" ? { age: state.age } : {}),
        });
        router.push(FIRST_RUN);
    }
  };

  const submit = () => {
    if (!ready || locked) return;
    setStatus("pending");
    setTrouble(false);
    void studentEntryApi.lookup({ schoolCode, admissionNumber: id }).then(
      (state) => {
        if (!alive.current) return;
        setStatus("success");
        timers.current.push(
          setTimeout(() => onward(state, schoolCode, id), MATCH_BEAT_MS),
        );
      },
      (err: unknown) => {
        if (!alive.current) return;
        setTrouble(!answeredAboutThePair(err));
        setStatus("error");
      },
    );
  };

  // The on-screen keyboard types into whichever field was focused last.
  const onKey = (ch: string) => {
    const at = active.current;
    if (at === "id") typeIntoId(admissionNumber + ch);
    else if (at !== null) typeIntoCell(at, ch);
  };
  const onBackspace = () => {
    const at = active.current;
    if (at === "id") typeIntoId(admissionNumber.slice(0, -1));
    else if (at !== null) backspaceCell(at);
  };

  if (held === "withdrawn") return <ConsentWithdrawn />;
  if (held) return <WaitingOnConsent hold={held} />;

  const { heading, sub } = FRAMING[framing];
  // The frame takes the tray down once the child has been found.
  const keyboardUp = pad.open && status !== "success";
  /** The server answered, and the pair matched nobody. Not a lookup we could not run. */
  const missed = status === "error" && !trouble;
  const message =
    status === "success"
      ? ENTRY_MATCHED_COPY
      : status === "error"
        ? trouble
          ? ENTRY_UNCHECKED_COPY
          : ENTRY_NO_MATCH_COPY
        : null;
  const fieldBorder =
    status === "success"
      ? "border-nevo-navy"
      : missed
        ? "border-nevo-violet"
        : "border-nevo-near-black/[0.16]";
  const cellBorder =
    status === "success"
      ? "border-nevo-navy"
      : missed
        ? "border-nevo-violet"
        : "border-nevo-near-black/[0.32]";
  const field =
    "relative flex h-15 w-full items-center rounded-[10px] border-[1.5px] bg-nevo-cream shadow-elevation-1 transition-colors sm:h-16";

  return (
    <OnboardingShell
      backHref={WELCOME}
      lifted={keyboardUp}
      footer={
        keyboardUp && (
          <NevoKeyboard
            layout="qwerty"
            onKey={onKey}
            onBackspace={onBackspace}
            onReturn={submit}
            className="sticky bottom-0 z-40 shrink-0"
          />
        )
      }
    >
      {/* Makes way for the keyboard, which is only ever up on touch. */}
      <div
        className={cn(
          "flex justify-center",
          keyboardUp && "[@media(pointer:coarse)]:hidden",
        )}
      >
        <IllustrationWrapper
          src="/illustrations/onboarding-school.png"
          alt="A friendly figure holding up a school card"
          width={671}
          height={963}
          priority
          className="w-[84px] sm:w-[130px] lg:w-[112px]"
        />
      </div>

      <h2
        className={cn(
          "mt-6 text-center text-xl leading-[1.25] font-medium tracking-[-0.01em] sm:text-2xl lg:text-[23px]",
          keyboardUp && "[@media(pointer:coarse)]:mt-0",
        )}
      >
        {heading}
      </h2>
      <p className="mt-2 text-center text-[15px] leading-normal text-nevo-near-black/62 sm:text-base">
        {sub}
      </p>

      <label
        id="entry-code-label"
        htmlFor="entry-code-0"
        className="mt-7 text-sm font-semibold text-nevo-near-black/72"
      >
        School code
      </label>
      <div
        role="group"
        aria-labelledby="entry-code-label"
        className={cn(field, fieldBorder, "mt-2 justify-center gap-3.5 px-4 sm:gap-4")}
      >
        {code.map((ch, i) => (
          <input
            key={i}
            id={`entry-code-${i}`}
            ref={(el) => {
              cellRefs.current[i] = el;
            }}
            value={ch}
            onChange={(e) => typeIntoCell(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !code[i]) {
                e.preventDefault();
                backspaceCell(i);
              } else if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            onFocus={(e) => {
              active.current = i;
              // Typing over a filled cell replaces it rather than appending.
              e.currentTarget.select();
              pad.onFocus();
            }}
            onBlur={pad.onBlur}
            readOnly={locked}
            // The Nevo keyboard is the input on touch (A.12); a hardware
            // keyboard still types on desktop, where the tray is hidden.
            inputMode="none"
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            aria-label={`School code, character ${i + 1} of ${SCHOOL_CODE_LENGTH}`}
            className={cn(
              "h-9 w-10 rounded-none border-0 border-b-2 bg-transparent p-0 text-center text-[22px] font-bold tracking-[0.02em] text-nevo-near-black uppercase outline-none transition-colors sm:h-10 sm:w-11 sm:text-[26px]",
              cellBorder,
            )}
          />
        ))}
      </div>

      <label
        htmlFor="entry-admission-number"
        className="mt-5 text-sm font-semibold text-nevo-near-black/72"
      >
        Student ID / Admission Number
      </label>
      <div className={cn(field, fieldBorder, "mt-2")}>
        <input
          id="entry-admission-number"
          ref={idRef}
          value={admissionNumber}
          onChange={(e) => typeIntoId(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          onFocus={() => {
            active.current = "id";
            pad.onFocus();
          }}
          onBlur={pad.onBlur}
          readOnly={locked}
          maxLength={ADMISSION_NUMBER_MAX}
          inputMode="none"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="h-full min-w-0 flex-1 bg-transparent pr-[52px] pl-[18px] text-[19px] font-medium tracking-[0.02em] text-nevo-near-black uppercase outline-none sm:text-[21px]"
        />
        {(status === "pending" || status === "success") && (
          <div className="absolute top-1/2 right-4 flex size-7 -translate-y-1/2 items-center justify-center">
            {status === "pending" ? (
              <span className="size-5 rounded-full border-[2.5px] border-nevo-navy/20 border-t-nevo-navy motion-safe:animate-spin" />
            ) : (
              <span className="flex size-7 items-center justify-center rounded-full bg-nevo-navy motion-safe:animate-nevo-pop">
                <Check className="size-4 text-nevo-cream" strokeWidth={2.6} />
              </span>
            )}
          </div>
        )}
      </div>

      <div role="status" className="mt-3 min-h-11">
        {message && (
          <p className="text-[14.5px] leading-[1.45] text-nevo-navy">
            {message}
          </p>
        )}
      </div>

      <div className="pt-2">
        <Button
          onClick={submit}
          disabled={!ready || locked}
          className="w-full text-base"
        >
          {missed ? "Try again" : "Continue"}
        </Button>
      </div>
    </OnboardingShell>
  );
}
