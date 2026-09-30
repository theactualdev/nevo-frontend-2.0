"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { authApi } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/client";
import {
  mergeOnboardingDraft,
  startOnboardingDraft,
} from "@/lib/auth/onboarding";
import { clearSession, getStoredDisplayName } from "@/lib/auth/session";
import { useAuth } from "@/hooks";
import { useHasSession } from "@/hooks/useHasSession";
import { useHydrated } from "@/hooks/useHydrated";
import { JoinHandover } from "./JoinHandover";
import { cn } from "@/lib/utils";
import {
  CLASS_CODE_MAX,
  CLASS_CODE_MIN,
  CodeInput,
  codeIsEnterable,
  normaliseCode,
} from "./CodeInput";

/*
 * THE CODE IS CHECKED FOR REAL NOW.
 *
 * This compared what a child typed against a literal `"MAP4KZ"` and never
 * called anything. The comment defending that said
 * `POST /api/v1/connections/class-code` was Bearer-only and so unreachable
 * before a session exists. IT IS NOT: the deployed spec gives that operation
 * `security: []`. It is public, it always was for this flow, and a real class
 * code has been failing here against a hardcoded demo string ever since.
 *
 * The 201 carries `classId` AND `schoolCode`, which is exactly what the rest of
 * onboarding needs - so a child who joins by class code can skip the school and
 * class steps entirely rather than being asked for a school code they were
 * never given.
 */

/** After a successful join the manual flow resumes at the name step. */
const NEXT_STEP = "/student/onboarding/name";

type Mode = "scan" | "code";
type CodeStatus = "idle" | "pending" | "success" | "error";

/**
 * Teacher Join (screen 03 / `Nevo Teacher Join Frame`) - reached from the
 * Welcome screen's teacher-invite sheet. Two ways in, freely switchable:
 * scan the class QR code, or type the six-character code the teacher reads
 * out. Success connects the class and resumes onboarding; a miss is quiet
 * violet, never red, and always points back to the teacher.
 */
export function TeacherJoin() {
  const router = useRouter();
  const params = useSearchParams();
  // A scanned class QR (C12) carries the code, so open straight into it.
  const scannedCode = params.get("code") ?? "";
  const initialMode =
    params.get("mode") === "code" || scannedCode ? "code" : "scan";
  const [mode, setMode] = useState<Mode>(initialMode);

  /*
   * A CLASS QR SCANNED ON A TABLET SOMEONE IS SIGNED INTO.
   *
   * The route guard lets onboarding through by prefix, because onboarding is
   * how a session gets made. So a new child scanning their class QR on a
   * tablet where another child was still signed in posted the code with THAT
   * child's token - connecting the wrong child to the class - and then ran
   * the whole baseline under their session, until PIN creation failed with no
   * onboarding token. The invitation-link door already hands the tablet over
   * explicitly; the QR door now does the same, before anything is sent.
   */
  const hydrated = useHydrated();
  const signedIn = useHasSession();
  const { signOut } = useAuth();
  const [handedOver, setHandedOver] = useState(false);
  const needsHandover = hydrated && signedIn && !handedOver;

  // A scanned code is a new child arriving at the door, not a step in a flow
  // already under way - so nothing from an earlier child's draft comes with
  // them. Reached from the class step instead, the draft is this child's own.
  useEffect(() => {
    if (!hydrated || needsHandover || !scannedCode) return;
    startOnboardingDraft();
  }, [hydrated, needsHandover, scannedCode]);

  // Nothing is posted until the client knows whether someone is signed in:
  // the scanned code submits itself on mount.
  if (!hydrated) return null;

  if (needsHandover) {
    return (
      <JoinHandover
        signedInName={getStoredDisplayName()}
        onCarryOn={() => {
          // Revoke and purge the signed-in child's session FIRST, so nothing
          // below can be attributed to them.
          signOut();
          clearSession();
          setHandedOver(true);
        }}
      />
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-nevo-cream text-nevo-near-black">
      <header className="flex h-14 shrink-0 items-center px-4 sm:h-16 sm:px-5">
        <button
          type="button"
          aria-label="Back"
          onClick={() => router.back()}
          className="flex size-11 cursor-pointer items-center justify-center rounded-[10px] transition-colors hover:bg-nevo-near-black/6"
        >
          <ChevronLeft className="size-6" strokeWidth={2} />
        </button>
        <Image
          src="/brand/nevo-wordmark.png"
          alt="Nevo"
          width={344}
          height={116}
          priority
          className="ml-1.5 h-4 w-auto sm:h-[18px]"
        />
      </header>

      {/*
        Centred on every screen, phones included (QA, 30 Sep) - it used to
        centre only from `sm` up. `my-auto` so a screen too short for the
        content scrolls from its top rather than clipping it.
      */}
      <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 pt-4 pb-7 sm:pt-0 sm:pb-11">
        <div className="my-auto flex w-full flex-col items-center">
          {mode === "scan" ? (
            <ScanMode onSwitch={() => setMode("code")} />
          ) : (
            <CodeMode
              initial={scannedCode}
              onSwitch={() => setMode("scan")}
              onJoined={() => router.push(NEXT_STEP)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** The QR viewfinder - simulated phases until real capture lands (TODO(api)). */
/**
 * The QR half - which is NOT a scanner, and no longer pretends to be one.
 *
 * IT USED TO FAKE A JOIN. Three timers walked "Looking for a code…" ->
 * "Found it - connecting you…" -> "You're in - opening your class…", and then
 * called `onJoined()` at 5.3 seconds having contacted nothing and written
 * nothing to the draft. No camera was ever opened; there is no `getUserMedia`,
 * no `BarcodeDetector` and no `<video>` anywhere in this app. A child was told
 * in plain words that they were in a class they had not joined - and this is
 * the PRIMARY button on the welcome sheet, so it was most children.
 *
 * The honest version is also the working one. The teacher's QR encodes a whole
 * URL - `${SITE_URL}/student/onboarding/teacher-join?code=<code>`
 * (`ClassQr.tsx:27`) - so the camera app every phone and tablet already has is
 * the scanner, and following it lands the child right here with `?code=`
 * filled in, which the code path below then checks for real. This screen's job
 * is to say that, and to get out of the way.
 */
function ScanMode({ onSwitch }: { onSwitch: () => void }) {
  const bracket = "absolute size-[34px] border-nevo-violet";

  return (
    <div className="flex w-full max-w-[440px] flex-col items-center text-center">
      <h1 className="text-[21px] leading-[1.25] font-semibold tracking-[-0.01em] sm:text-2xl">
        Point your camera at the QR code
      </h1>
      <p className="mt-3 max-w-[330px] text-[15px] leading-[1.55] text-nevo-near-black/66 sm:text-base">
        Ask your teacher to show it, then open the camera on your device and
        hold it steady. It will bring you straight back here.
      </p>

      {/* The frame's viewfinder, as an illustration of what to look for. It is
          deliberately not animated any more: a scanline implies this screen is
          looking, and it is not. */}
      <div className="relative mt-8 size-[258px] shrink-0 overflow-hidden rounded-[20px] bg-nevo-near-black shadow-[0_8px_32px_rgba(0,0,0,0.16)] sm:size-[300px]">
        <span
          className={cn(
            bracket,
            "top-4 left-4 rounded-tl-[10px] border-t-[3px] border-l-[3px]",
          )}
        />
        <span
          className={cn(
            bracket,
            "top-4 right-4 rounded-tr-[10px] border-t-[3px] border-r-[3px]",
          )}
        />
        <span
          className={cn(
            bracket,
            "bottom-4 left-4 rounded-bl-[10px] border-b-[3px] border-l-[3px]",
          )}
        />
        <span
          className={cn(
            bracket,
            "right-4 bottom-4 rounded-br-[10px] border-r-[3px] border-b-[3px]",
          )}
        />
      </div>

      <p className="mt-[22px] max-w-[300px] text-sm leading-[1.5] text-nevo-near-black/60">
        No camera? Your teacher can read the code out instead.
      </p>

      <button
        type="button"
        onClick={onSwitch}
        className="mt-4 h-11 cursor-pointer rounded-[10px] px-[18px] text-[15px] font-medium text-nevo-navy transition-colors hover:bg-nevo-near-black/5"
      >
        Enter a code instead
      </button>
    </div>
  );
}

/**
 * Class-code entry: one field, checked against the roster for real.
 *
 * It was six fixed boxes compared against a hardcoded string - the same
 * fixed-length guess that made the school screen a wall, and
 * `ClassCodeConnectionRequest` accepts 4 to 20 characters. `CodeInput` is
 * shared with the school step so neither can drift back into guessing.
 */
function CodeMode({
  initial = "",
  onSwitch,
  onJoined,
}: {
  /** Prefilled when the student arrived by scanning the class QR. */
  initial?: string;
  onSwitch: () => void;
  onJoined: () => void;
}) {
  const [code, setCode] = useState(() =>
    normaliseCode(initial, CLASS_CODE_MAX),
  );
  // Seeded, not set from the effect below: a scanned code arrives already
  // complete, so it is pending from the first render rather than after one.
  const [status, setStatus] = useState<CodeStatus>(() =>
    codeIsEnterable(normaliseCode(initial, CLASS_CODE_MAX), CLASS_CODE_MIN)
      ? "pending"
      : "idle",
  );
  /**
   * A code that named no class, versus a check we could not run. A child must
   * never be told their code is wrong because our request failed.
   */
  const [trouble, setTrouble] = useState(false);
  const submitted = useRef(false);

  /** The request itself. Sets state only from the response, never inline. */
  const post = useCallback(
    (entered: string) => {
      void authApi.connectClassCode({ classCode: entered }).then(
        (connection) => {
          setStatus("success");
          /*
           * WHAT THE ROSTER TOLD US, so the rest of onboarding can stop asking.
           * `classId` and `schoolCode` are exactly what `connectClassCode` is
           * called with again at PIN time, and what `NameAndAgeStep` reads to
           * know this child needs neither the school step nor the class step.
           *
           * The onboarding token is deliberately NOT kept: it lives 20 minutes,
           * the profiling probes and consent gate sit between here and account
           * creation, and the sequence mints a fresh one at the moment it is
           * spent. A stale token in a child's hands is a failure at the last
           * step of onboarding.
           */
          mergeOnboardingDraft({
            classId: connection.classId,
            // The code itself too: `schoolCode` is nullable on this response,
            // and `{ classCode }` alone is a form the connect endpoint accepts.
            classCode: entered,
            ...(connection.schoolCode
              ? { schoolCode: connection.schoolCode }
              : {}),
          });
          onJoined();
        },
        (err: unknown) => {
          // 4xx is the roster's answer about this code; anything else is ours.
          const answered =
            err instanceof ApiError && err.status >= 400 && err.status < 500;
          setTrouble(!answered);
          setStatus("error");
        },
      );
    },
    [onJoined],
  );

  /** What a child pressing the button or Return does. */
  const join = (entered: string) => {
    if (!codeIsEnterable(entered, CLASS_CODE_MIN)) return;
    setStatus("pending");
    setTrouble(false);
    post(entered);
  };

  // A scanned QR arrives complete, so check it without making a child retype a
  // character to wake it up. Once only - a re-render must not re-post. The
  // pending state is seeded above, so this fires the request and sets nothing.
  useEffect(() => {
    if (submitted.current) return;
    const scanned = normaliseCode(initial, CLASS_CODE_MAX);
    if (!codeIsEnterable(scanned, CLASS_CODE_MIN)) return;
    submitted.current = true;
    post(scanned);
  }, [initial, post]);

  return (
    <div className="flex w-full max-w-[440px] flex-col items-center text-center">
      <h1 className="text-[21px] leading-[1.25] font-semibold tracking-[-0.01em] sm:text-2xl">
        Enter your class code
      </h1>
      <p className="mt-3 max-w-[320px] text-[15px] leading-[1.55] text-nevo-near-black/66 sm:text-base">
        Your teacher will read this out to you.
      </p>

      <div className="mt-8 w-full">
        <CodeInput
          value={code}
          onChange={(next) => {
            setCode(next);
            setStatus("idle");
            setTrouble(false);
          }}
          onSubmit={join}
          status={status}
          label="Class code"
          placeholder="Type your class code"
          min={CLASS_CODE_MIN}
          max={CLASS_CODE_MAX}
        />
      </div>

      <div className="mt-3 min-h-[22px]">
        {status === "success" && (
          <p className="text-sm text-nevo-navy">
            That&apos;s it - connecting you to your class…
          </p>
        )}
        {status === "error" && (
          /* Both stay quiet violet and both point back at the teacher, but they
             are different sentences now. Until this screen actually checked
             anything, the only honest copy was "we can't check class codes just
             yet"; now that it does, a child whose code was refused deserves to
             be told that, and a child whose check WE failed must not be. */
          // A child cannot act on a message they cannot read: violet is
          // 2.34:1 on cream, and this is the sentence telling them what to do.
          <p className="text-sm text-nevo-violet-text">
            {trouble
              ? "We couldn't check that just now. Give it a moment and try again."
              : "That code doesn't match a class. Check it with your teacher."}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => (status === "success" ? onJoined() : join(code))}
        disabled={
          status === "pending" ||
          (status !== "success" && !codeIsEnterable(code, CLASS_CODE_MIN))
        }
        className={cn(
          "mt-5 flex h-[52px] w-full items-center justify-center rounded-[10px] bg-nevo-navy text-base font-medium text-nevo-cream transition-[opacity,filter]",
          status === "pending" ||
            (status !== "success" && !codeIsEnterable(code, CLASS_CODE_MIN))
            ? "cursor-not-allowed opacity-40"
            : "cursor-pointer hover:brightness-106 active:scale-[0.99]",
        )}
      >
        {status === "success" ? "Continue" : "Join my class"}
      </button>

      <button
        type="button"
        onClick={onSwitch}
        className="mt-[18px] h-11 cursor-pointer rounded-[10px] px-[18px] text-[15px] font-medium text-nevo-navy transition-colors hover:bg-nevo-near-black/5"
      >
        Scan a QR code instead
      </button>
    </div>
  );
}
