"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { NevoKeyboard, useNevoKeyboardDock } from "@/components/shared";
import { Wordmark } from "@/components/shared/BrandMarks";
import {
  CodeInput,
  SCHOOL_CODE_MAX,
  SCHOOL_CODE_MIN,
  normaliseCode,
} from "@/components/student/Onboarding/CodeInput";
import { authApi } from "@/lib/api";
import { usersApi } from "@/lib/api/users";
import {
  classifyLearnerLoginFailure,
  type LearnerLoginFailure,
} from "@/lib/auth/loginFailure";
import {
  doorForRole,
  knownRole,
  type ConsoleDoor,
} from "@/lib/auth/consoleDoor";
import { rememberProfile } from "@/lib/auth/session";
import {
  clearSignInHandoff,
  peekSignInHandoff,
} from "@/lib/auth/signInHandoff";
import { studentDestination } from "@/lib/auth/entryGate";
import { useAuth } from "@/hooks";
import {
  STUDENT_PIN_LENGTH,
  STUDENT_PIN_MAX,
  STUDENT_PIN_MIN,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { AccountOnPauseScreen } from "./AccountOnPauseScreen";
import { SignedInHereScreen } from "./SignedInHereScreen";
import {
  SIGN_IN_OURS_COPY,
  SIGN_IN_THROTTLED_COPY,
  skipsWelcomeBeat,
} from "./signInMoments";
import { WrongDoorNote } from "./WrongDoorNote";

/**
 * Returning Student Sign-In, unrecognised device (frame 00c).
 *
 * THE DOOR THAT WAS NOT THERE. `/auth/login` unlocks the ONE profile a device
 * remembers, and when it remembered nobody it sent the child into onboarding -
 * which creates a SECOND account. A child on a cleared browser, a new tablet, a
 * reimaged school laptop, or a shared tablet where another child onboarded
 * after them, lost their history and their class every time, and nothing told
 * them or their teacher that it had happened.
 *
 * Design ruled on 14 Sep and chose this over a class name-picker: the child
 * names themselves. That trades some friction for a roster never being exposed
 * to anyone holding a class code, and it needs nothing from backend -
 * `POST /auth/login/pin` is public and has always taken these three fields.
 *
 * THE SECOND FIELD IS "STUDENT ID / ADMISSION NUMBER", as 00c labels it since
 * 30 Sep. Sign-in matches either the school's Student ID or the login handle
 * Nevo issued (backend, 1 Oct), so the field sends exactly what the child
 * types, as `admissionNumber`, and the server decides which one it is. The
 * help row points at the person who can read it out.
 *
 * PRE-FILLED FROM 05 ENTRY for a child the lookup says already has an
 * account (`accountReady`): they typed the code and the ID one screen ago,
 * and only the PIN is left. See `signInHandoff`.
 *
 * "DIDN'T MATCH" KEEPS THE FIELDS FILLED, per the frame - only the PIN clears.
 * Making a child retype a school code and a username they have just been read
 * out is how you lose them at the last step.
 */

/**
 * Bound only by what the contract takes: `PinLoginRequest.admissionNumber` is
 * 1-60. It was 50, the old identifier's cap, which cut a long Student ID from
 * 05 Entry (60 there too) short before it was ever sent.
 */
const USERNAME_MIN = 1;
const USERNAME_MAX = 60;

/**
 * Avatar initials from a USERNAME, which is not a name.
 *
 * Onboarding derives these from what a child typed about themselves - "Amara
 * Kalu" -> "AK" - and splits on whitespace. A server-issued identifier has no
 * whitespace in it: `amara.k` would give "AM" through that path, which is
 * nobody's initials. Splitting on the separators an identifier actually uses
 * gets back to "AK".
 *
 * It is a stand-in either way. Nothing on this path returns a display name, so
 * both this and the name itself are replaced the moment something reads
 * `users/me`.
 */
function initialsFromUsername(identifier: string): string {
  const parts = identifier.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return identifier
    .replace(/[^\p{L}\p{N}]/gu, "")
    .slice(0, 2)
    .toUpperCase();
}

/** Long enough to read "Welcome back", short enough not to feel stuck. */
const DONE_MS = 1200;

export function ReturningSignInScreen({ next }: { next?: string }) {
  const router = useRouter();
  const { signIn } = useAuth();

  // From 05, when it sent this child here; empty on any other arrival.
  const [schoolCode, setSchoolCode] = useState(() =>
    normaliseCode(peekSignInHandoff()?.schoolCode ?? "", SCHOOL_CODE_MAX),
  );
  const [username, setUsername] = useState(() =>
    (peekSignInHandoff()?.identifier ?? "").slice(0, USERNAME_MAX),
  );
  // Spent once this screen has it, so the next visit starts empty.
  useEffect(() => clearSignInHandoff(), []);
  const [digits, setDigits] = useState("");
  const [done, setDone] = useState(false);
  /**
   * Where the child goes once they have read that this sign-in ended their
   * session elsewhere (D59, `SignedInHereScreen`). Null when it ended nothing.
   */
  const [releasedTo, setReleasedTo] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<LearnerLoginFailure | null>(null);
  /** Whose door a non-student account belongs at; see `WrongDoorNote`. */
  const [wrongDoor, setWrongDoor] = useState<ConsoleDoor | null>(null);
  /**
   * The number pad is DOCKED AND FOCUS-DRIVEN here - design's ruling D on
   * 00c, PIN creation and 00: "a focus-driven pad is transient, and a docked
   * tray reads as transient". The block pad is 28c's exception, for a screen
   * whose pad is the whole point.
   *
   * It was a permanent block pad, and the school code field opens its own
   * qwerty tray on focus - so this form showed TWO keyboards at once. Now each
   * field brings its own and only the focused one is up.
   */
  const pad = useNevoKeyboardDock();
  /**
   * The first name to greet them by, once `users/me` answers. Null until then,
   * and the greeting is a bare "Welcome back" - never the username, which is
   * half a credential on a screen anyone in the room can read.
   */
  const [greetName, setGreetName] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The field the PIN boxes are a picture of. See the row itself. */
  const pinRef = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      if (doneTimer.current) clearTimeout(doneTimer.current);
    },
    [],
  );

  /*
   * ONE APPENDER for the pad and the keyboard. They filled `digits` through
   * two separate inline closures before this screen had a keyboard path at
   * all; two copies of "add a digit unless we are full" is how they end up
   * disagreeing about the cap.
   */
  const addDigits = useCallback(
    (raw: string) => {
      const add = raw.replace(/[^0-9]/g, "");
      if (!add) return;
      setError(null);
      /*
       * UP TO EIGHT, NOT THE LENGTH A NEW PIN IS CREATED AT.
       *
       * A child meets this form on a device that has never seen them, so it
       * has no idea how long their PIN is - and since 25 Sep it could be four
       * (any new one) or six (every earlier one, and every adult's reset).
       * Capping at four would submit two-thirds of a six-digit PIN. The Sign
       * in button is what says "done", so the form can take the whole range.
       */
      setDigits((d) => (d + add).slice(0, STUDENT_PIN_MAX));
    },
    [],
  );

  const identifier = username.trim();
  const school = schoolCode.trim();
  const ready =
    school.length >= SCHOOL_CODE_MIN &&
    identifier.length >= USERNAME_MIN &&
    digits.length >= STUDENT_PIN_MIN;

  /**
   * On from a sign-in that worked: the "Welcome back" beat, then where they
   * were going - or straight there, with no beat, for a child the consent gate
   * holds (D2). True when it navigated at once.
   */
  const goOn = useCallback(
    (destination: string): boolean => {
      if (skipsWelcomeBeat(destination)) {
        router.push(destination);
        return true;
      }
      setDone(true);
      doneTimer.current = setTimeout(() => router.push(destination), DONE_MS);
      return false;
    },
    [router],
  );

  const submit = useCallback(async () => {
    if (!ready || checking) return;
    setChecking(true);
    setError(null);
    // Leaving for the waiting screen: the button stays busy until it lands.
    let leaving = false;
    try {
      const session = await authApi.loginPin({
        schoolCode: school,
        admissionNumber: identifier,
        pin: digits,
      });
      /*
       * REFUSE AT THE DOOR, before anything is remembered or stored against
       * this device - the same check the admin and teacher doors make, from
       * the guard's own rule. The login did succeed, so the session it made
       * is ended rather than left behind.
       */
      const role = knownRole(session.role);
      const door = doorForRole(role);
      if (door !== "student" || !role) {
        setDigits("");
        setWrongDoor(door);
        setError("wrong_door");
        void authApi.logout().catch(() => {});
        return;
      }
      /*
       * Remember the device NOW, so the next visit is the one-tap PIN unlock
       * rather than this form again. That is the whole point of the screen: a
       * child signs in the hard way once, and never again on this device.
       *
       * REMEMBERED WITHOUT A NAME, because this flow does not know one yet. A
       * PIN login returns a session, not a profile. The previous version filled
       * the gap with the LOGIN IDENTIFIER, which put `amara.k` on the lock
       * screen permanently - a string that is half a credential, sitting on a
       * pre-authentication screen, beside a school code every child in the
       * building already knows - and greeted the child by their username on
       * every screen that reads this profile.
       */
      rememberProfile({
        schoolCode: school,
        loginIdentifier: identifier,
        // Two letters, not an identifier. Better than a blank circle, and it
        // is replaced the moment the real name lands below.
        initials: initialsFromUsername(identifier),
        // So the one-tap unlock tomorrow draws the right number of boxes.
        pinLength: digits.length,
        // So a signed-in screen can find THIS child's entry on a shared tablet.
        userId: session.userId,
      });
      signIn({
        id: session.userId,
        // `name` is optional on AuthUser, and absent beats the username.
        role,
        schoolId: school,
        method: "manual",
      });
      /*
       * Then go and learn their name, WITHOUT the child waiting on it.
       *
       * `users/me` is callable now that `loginPin` has stored the session. The
       * first version of this awaited it before remembering anything, which
       * made a profile read stand between a child and the door they had just
       * unlocked - on a slow connection they would sit on a form they had
       * already passed. Two of this screen's own tests caught it.
       *
       * So the door opens first and the name catches up. It lands inside the
       * 1.2s "Welcome back" hold in the ordinary case, and when it does not,
       * the child is already in their lessons and the lock screen simply
       * learns their name before the next one.
       *
       * Not cancelled on unmount on purpose: this writes to the device store,
       * not to React state, and the whole point is that it outlives this
       * screen.
       */
      void usersApi
        .me()
        .then((me) => {
          // The name they chose for themselves first (`preferredName`), then
          // the school's record - what every signed-in screen calls them.
          const first =
            (me.preferredName?.trim() || me.firstName || me.displayName || "")
              .trim()
              .split(/\s+/)[0] || "";
          if (!first) return;
          rememberProfile({
            schoolCode: school,
            loginIdentifier: identifier,
            displayName: first,
            initials: first.slice(0, 2).toUpperCase(),
            userId: session.userId,
          });
          // And the greeting, if they are still looking at it.
          if (alive.current) setGreetName(first);
        })
        .catch(() => {
          // Not knowing their name is not a reason to undo a sign-in they have
          // already passed. The device remembers them namelessly instead, and
          // "Welcome back" alone is a better greeting than their username.
        });
      /*
       * Consent is resolved before the child lands anywhere - design, 23 Sep:
       * the gate is on the child's state, not on the door they used, and PIN
       * sign-in is an entry path.
       *
       * BEFORE THE "WELCOME BACK" BEAT, NOT INSIDE IT (D2). A child about to
       * be held never sees "Taking you to your lessons", because it is not
       * true: they go straight to the waiting screen.
       */
      const destination = await studentDestination(next);
      // D59 first, when this ended a session elsewhere; its Continue goes on.
      if (session.replacedSession === true) {
        setReleasedTo(destination);
        return;
      }
      leaving = goOn(destination);
    } catch (cause) {
      // Only the PIN clears. The other two fields stay, deliberately.
      setDigits("");
      setError(classifyLearnerLoginFailure(cause));
    } finally {
      if (!leaving) setChecking(false);
    }
  }, [ready, checking, school, identifier, digits, signIn, next, goOn]);

  /*
   * A paused account takes the whole screen, exactly as it does at the PIN
   * unlock. There is nothing here a child can do, and leaving the form
   * underneath would invite them to keep trying something that cannot work.
   * A closed account is the same screen saying closed, never on pause (D53).
   */
  if (error === "paused" || error === "closed") {
    // No retry, but a way back to the picker for whoever is next (D52).
    return <AccountOnPauseScreen back={{ href: "/auth/login" }} hold={error} />;
  }

  if (done) {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-nevo-cream px-10 text-center text-nevo-near-black">
        <span className="flex size-16 items-center justify-center rounded-full bg-nevo-navy motion-safe:animate-nevo-pop">
          <Check className="size-[34px] text-nevo-cream" strokeWidth={2.6} />
        </span>
        <h2 className="mt-5 text-[23px] leading-[1.3] font-medium tracking-[-0.01em] sm:text-[26px]">
          {/*
            NEVER THE USERNAME. This read "Welcome back, amara.k" - the login
            identifier, on a shared tablet, beside a school code the whole
            building knows. The first name arrives inside this 1.2s hold in the
            ordinary case; until it does, "Welcome back" is warm and true.
          */}
          {greetName ? `Welcome back, ${greetName}` : "Welcome back"}
        </h2>
        <p className="mt-2.5 text-[15px] text-nevo-near-black/60">
          Taking you to your lessons…
        </p>
      </main>
    );
  }

  if (releasedTo !== null) {
    // Stays up for a held child while the waiting screen loads.
    return <SignedInHereScreen onContinue={() => goOn(releasedTo)} />;
  }

  /*
   * The button reads "Try again" after a failure the child can retry, as
   * 00c's error state draws it. Not after a wrong-door refusal or a rate
   * limit: pressing again is the one thing that cannot help there.
   */
  const retry = error === "credentials" || error === "ours";

  return (
    <main className="flex min-h-[100dvh] w-full flex-col bg-nevo-cream text-nevo-near-black">
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col items-center px-7 pt-[52px] text-center sm:px-12 sm:pt-14",
          // The frame lifts the form to the top while the pad is up, so the
          // field being typed into and the button stay above it.
          pad.open ? "justify-start pb-5" : "justify-center pb-6 sm:pb-8",
        )}
      >
        <Wordmark size="form" />

        {/* 00c's words. It read "Sign back in", with the help folded into a
            line under the heading. */}
        <h1 className="mt-[26px] text-2xl leading-[1.25] font-medium tracking-[-0.01em] sm:text-[28px]">
          Welcome back
        </h1>
        <p className="mt-2.5 text-[15px] leading-[1.4] text-nevo-near-black/60 sm:text-base">
          Let&apos;s get you back into your lessons.
        </p>

        <div className="mt-7 flex w-full max-w-[336px] flex-col gap-[18px] text-left sm:gap-5">
          <div className="flex flex-col gap-2">
            {/*
              A VISIBLE label, not just `CodeInput`'s `label` prop - that one is
              an `aria-label` and shows a sighted child nothing. Elsewhere in
              onboarding a code field stands alone and the heading above says
              what it is; here there are three fields in a row, and a child
              being read a code and a username by their teacher has to know
              which box takes which.
            */}
            <p className="text-[13px] font-semibold text-nevo-near-black/70 sm:text-[13.5px]">
              Your school code
            </p>
            {/*
              CENTRED, as 00c centres its code cells. From here rather than
              inside `CodeInput`, which the school step shares and which the
              entry rework (SCRUM-208) owns; this screen never shows its
              pending or success mark, so the room kept for it goes too.
            */}
            <div className="[&_input]:pr-0 [&_input]:text-center">
              <CodeInput
                value={schoolCode}
                onChange={(v) =>
                  setSchoolCode(normaliseCode(v, SCHOOL_CODE_MAX))
                }
                onSubmit={() => void submit()}
                status={error === "credentials" ? "error" : "idle"}
                label="School code"
                placeholder="Your school code"
                min={SCHOOL_CODE_MIN}
                max={SCHOOL_CODE_MAX}
              />
            </div>
          </div>
          {/*
            NOT `CodeInput`, deliberately. That component normalises everything
            typed into it with `normaliseCode` - uppercase, and strip anything
            that is not A-Z, 0-9 or a hyphen - which is right for a school code
            and destroys an identifier. `amara.k` arrives as `AMARAK`, and
            `BGA/2031` as `BGA2031`, which the server has never heard of. What
            the child types is sent back exactly as typed.

            NO PLACEHOLDER: 00c draws the field empty. It said "Ask your
            teacher", which the help row under the button already says.
          */}
          <div className="flex flex-col gap-2">
            <label
              htmlFor="returning-username"
              className="text-[13px] font-semibold text-nevo-near-black/70 sm:text-[13.5px]"
            >
              Student ID / Admission Number
            </label>
            <div
              className={cn(
                "relative flex h-15 w-full items-center rounded-[10px] border-[1.5px] bg-nevo-cream px-4 shadow-elevation-1 transition-colors sm:h-17",
                error === "credentials"
                  ? "border-nevo-violet"
                  : "border-nevo-near-black/[0.16]",
              )}
            >
              <input
                id="returning-username"
                value={username}
                onChange={(e) =>
                  setUsername(e.target.value.trimStart().slice(0, USERNAME_MAX))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void submit();
                  }
                }}
                maxLength={USERNAME_MAX}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="w-full bg-transparent text-[17px] text-nevo-near-black outline-none"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <p
              id="returning-pin-label"
              className="text-[13px] font-semibold text-nevo-near-black/70 sm:text-[13.5px]"
            >
              Your PIN
            </p>
            {/*
              THE PIN ROW HAD NO INPUT OF ANY KIND.

              The boxes are drawn from `digits`; the school code and username
              above are real fields, so a keyboard carried a child that far and
              then met six boxes with nothing behind them. The Nevo pad was the
              only way to fill them, and the pad hides itself on a device with a
              real keyboard - so this screen could not be completed on a laptop
              at all. It is the screen a child reaches on an UNKNOWN device,
              which is exactly where a borrowed laptop shows up.

              A real input, laid over the boxes rather than parked off-screen:
              it takes its turn in the tab order straight after the username,
              and clicking the boxes focuses it because it covers them. The
              boxes stay the presentation, which is why it is transparent rather
              than hidden - a `display:none` field is not focusable.

              `inputMode="none"` keeps the OS keyboard away on touch, where the
              Nevo pad is the designed way in - and focusing this field is
              what brings it up.
            */}
            <div className="relative">
              <input
                ref={pinRef}
                value=""
                onChange={(e) => {
                  addDigits(e.target.value);
                  e.target.value = "";
                }}
                onKeyDown={(e) => {
                  if (e.key === "Backspace") {
                    e.preventDefault();
                    setDigits((d) => d.slice(0, -1));
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void submit();
                  }
                }}
                onFocus={pad.onFocus}
                onBlur={pad.onBlur}
                inputMode="none"
                autoComplete="off"
                aria-labelledby="returning-pin-label"
                className="absolute inset-0 z-10 h-full w-full cursor-text rounded-[10px] bg-transparent opacity-0 outline-none"
              />
              <div
                className="flex flex-wrap justify-center gap-3.5"
                role="group"
                aria-labelledby="returning-pin-label"
              >
                {/* Four boxes, and one more for each digit past four. */}
                {Array.from(
                  { length: Math.max(STUDENT_PIN_LENGTH, digits.length) },
                  (_, i) => {
                    const active = i === digits.length && !checking;
                    return (
                      <div
                        key={i}
                        className={cn(
                          "flex size-[58px] items-center justify-center rounded-[10px] bg-nevo-cream shadow-[0_2px_8px_rgba(0,0,0,0.05)] sm:size-[66px]",
                          active
                            ? "border-2 border-nevo-navy"
                            : error
                              ? "border-[1.5px] border-nevo-violet"
                              : "border-[1.5px] border-nevo-near-black/20",
                        )}
                      >
                        {digits.length > i && (
                          <span className="block size-[13px] rounded-full bg-nevo-near-black sm:size-3.5" />
                        )}
                      </div>
                    );
                  },
                )}
              </div>
            </div>
          </div>

          {/*
            00c's error: a soft violet box with an info mark, the fields kept
            filled. It was a plain violet line with nothing to anchor it.
          */}
          {error && (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-[10px] bg-nevo-violet/18 px-[15px] py-[13px]"
            >
              <span className="mt-px flex shrink-0 text-nevo-navy">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8h.01M11 12h1v4h1" />
                </svg>
              </span>
              <span className="text-sm leading-[1.5] text-nevo-near-black">
                {error === "credentials" &&
                  "Hmm, that didn't match. Check your school code and Student ID / Admission Number with your teacher and try again."}
                {/* 28c's door lines (D68), the same on every PIN door. */}
                {error === "throttled" && SIGN_IN_THROTTLED_COPY}
                {error === "ours" && SIGN_IN_OURS_COPY}
                {error === "wrong_door" && <WrongDoorNote door={wrongDoor} />}
              </span>
            </div>
          )}

          <button
            type="button"
            disabled={!ready || checking}
            onClick={() => void submit()}
            className={cn(
              "mt-1 h-14 w-full rounded-[10px] bg-nevo-navy text-base font-semibold tracking-[-0.005em] text-nevo-cream",
              ready && !checking
                ? "cursor-pointer transition-[filter,transform] hover:brightness-108 active:scale-[0.985]"
                : "cursor-not-allowed opacity-40",
            )}
          >
            {retry ? "Try again" : "That's me"}
          </button>

          {/* 00c's own row for the help, not folded into the heading's line.
              Text, not a link: there is nothing on this device to open. */}
          <p className="mt-0.5 text-center text-[14.5px]">
            <span className="text-nevo-near-black/60">
              Don&apos;t know your Student ID / Admission Number?{" "}
            </span>
            <span className="font-medium text-nevo-navy">Ask your teacher.</span>
          </p>
        </div>

        {/*
          NOT IN THE FRAME, and here because removing it would break something
          that works today. `/auth/login` used to send a child with no remembered
          profile into onboarding, which is how a NEW child reached onboarding at
          all - the landing page has no student door. Now that it comes here
          instead, this is the only way left to create an account.
        */}
        <button
          type="button"
          onClick={() => router.push("/student/onboarding")}
          className="mt-3 h-11 cursor-pointer px-4 text-[15px] font-medium text-nevo-navy"
        >
          I&apos;m new to Nevo
        </button>
      </div>

      {pad.open && (
        <NevoKeyboard
          layout="pad"
          onKey={(char) => {
            if (checking) return;
            addDigits(char);
          }}
          onBackspace={() => setDigits((d) => d.slice(0, -1))}
          // Docked, and in the flow rather than fixed over it: the page grows
          // by the tray's height, so nothing it docks over is out of reach.
          className="sticky bottom-0 z-40"
        />
      )}
    </main>
  );
}
