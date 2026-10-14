"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { NevoKeyboard, useNevoKeyboardDock } from "@/components/shared";
import { Wordmark } from "@/components/shared/BrandMarks";
import { authApi } from "@/lib/api";
import { usersApi } from "@/lib/api/users";
import {
  classifyLearnerLoginFailure,
  type LearnerLoginFailure,
} from "@/lib/auth/loginFailure";
import { doorForRole, knownRole } from "@/lib/auth/consoleDoor";
import { withNext } from "@/lib/auth/nextPath";
import { SCHOOL_CODE_LENGTH, placeSchoolCode } from "@/lib/auth/schoolCode";
import { closeRememberedChild } from "@/lib/auth/deviceRoster";
import { rememberProfile } from "@/lib/auth/session";
import {
  clearSignInHandoff,
  peekSignInHandoff,
} from "@/lib/auth/signInHandoff";
import { studentDestination } from "@/lib/auth/entryGate";
import { useAuth } from "@/hooks";
import { STUDENT_PIN_LENGTH } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { AccountClosedScreen } from "./AccountClosedScreen";
import { AccountOnPauseScreen } from "./AccountOnPauseScreen";
import { PinBox } from "./PinBox";
import { SignedInHereScreen } from "./SignedInHereScreen";
import {
  SIGN_IN_OURS_COPY,
  skipsWelcomeBeat,
} from "./signInMoments";
import {
  HeldPinBoxes,
  RAISED_FORGOT,
  THROTTLED_PAUSE_COPY,
  ThrottleNote,
} from "./ThrottledPause";
import {
  WrongDoorNote,
  studentDoorRefusal,
  type StudentDoorRefusal,
} from "./WrongDoorNote";
import { WrongDoorScreen } from "./WrongDoorScreen";

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
 * THE SCHOOL CODE IS FOUR CELLS (D6), as 05 Entry draws it and with 05's
 * rule (`lib/auth/schoolCode`): every school's code has been four characters
 * since 30 Sep (SCRUM-201), from an alphabet with no 0, O, 1 or I. It was a
 * free-text field from when codes were `751A1136` and `BGA-4827`, with a
 * "YOUR SCHOOL CODE" placeholder the frame never drew. Every live code fits;
 * the contract's own bound (2-50) is wider than any of them.
 *
 * PRE-FILLED FROM 05 ENTRY for a child the lookup says already has an
 * account (`accountReady`): they typed the code and the ID one screen ago,
 * and only the PIN is left - so the PIN is what is focused, not the code.
 * See `signInHandoff`.
 *
 * "DIDN'T MATCH" KEEPS EVERYTHING FILLED, the four PIN dots included, with
 * "Try again" live (frame 00c, state 3). Making a child retype a school code
 * and a username they have just been read out is how you lose them at the
 * last step, and the frame's line sends them to check those two, not the PIN.
 */

/** Four empty cells. */
const NO_CODE: readonly string[] = Array.from(
  { length: SCHOOL_CODE_LENGTH },
  () => "",
);

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

/**
 * 00c's field shell, for the school code's cells and the Student ID alike:
 * 56px (60 from `sm`), a navy hairline at 40% on cream-elevated.
 */
const FIELD_SHELL =
  "relative flex h-14 w-full items-center rounded-[10px] border-[1.5px] border-nevo-navy/40 bg-nevo-cream-elevated px-4 sm:h-15";

/** Clear space between "That's me" and the top of the docked pad. */
const ABOVE_THE_PAD = 12;

/**
 * How far to scroll so a button sits above a docked keyboard, by the least
 * that does it: the button's bottom edge and the keyboard's top edge, both in
 * viewport pixels. Zero when it is already clear.
 */
export function scrollToClearPad(buttonBottom: number, padTop: number): number {
  return Math.max(0, Math.ceil(buttonBottom + ABOVE_THE_PAD - padTop));
}

/** Long enough to read "Welcome back", short enough not to feel stuck. */
const DONE_MS = 1200;

export function ReturningSignInScreen({ next }: { next?: string }) {
  const router = useRouter();
  const { signIn } = useAuth();

  // From 05, when it sent this child here; empty on any other arrival.
  const [code, setCode] = useState<string[]>(
    () =>
      placeSchoolCode(NO_CODE, 0, peekSignInHandoff()?.schoolCode ?? "").cells,
  );
  const [username, setUsername] = useState(() =>
    (peekSignInHandoff()?.identifier ?? "").slice(0, USERNAME_MAX),
  );
  /**
   * Both of the first two fields arrived filled from 05, so the PIN is the
   * one left and the one focused. Focusing the code instead put its keyboard
   * up over the help row, on a field the child had nothing to type into.
   */
  const [handedOver] = useState(() => {
    const handoff = peekSignInHandoff();
    return Boolean(handoff?.schoolCode && handoff.identifier.trim());
  });
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
  /** Whose account a non-student one is; see `studentDoorRefusal`. */
  const [wrongDoor, setWrongDoor] = useState<StudentDoorRefusal | null>(null);
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
  /** The school code's own keyboard, a qwerty tray docked the same way. */
  const codeKeys = useNevoKeyboardDock();
  const cellRefs = useRef<(HTMLInputElement | null)[]>([]);
  const idRef = useRef<HTMLInputElement>(null);
  /** The cell the on-screen keyboard types into - the last one focused. */
  const activeCell = useRef<number | null>(null);
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
   * A FRESH LOAD FOCUSES THE FIRST CELL BEFORE THE PAGE CAN LISTEN. The
   * server's HTML carries `autofocus`, so the browser focuses cell 0 before
   * hydration and the focus event reaches nothing: the tray stayed down, and
   * tapping a cell that already has focus fires no second one, so on touch -
   * where `inputMode="none"` keeps the device's keyboard away - the first
   * cell could not be typed into at all. Arriving by client navigation was
   * fine. So once the page is listening, a cell that already has focus opens
   * its tray, as it would have; and a tap on a cell opens it too.
   */
  const openCodeKeys = (i: number) => {
    activeCell.current = i;
    pad.close();
    codeKeys.onFocus();
  };
  useEffect(() => {
    const at = cellRefs.current.findIndex(
      (el) => el !== null && el === document.activeElement,
    );
    if (at >= 0) openCodeKeys(at);
    // Once, on the first commit: it answers only the focus that came before it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * THE PAD DOCKS UNDER "THAT'S ME", NOT OVER IT. It is in the flow, so the
   * page grows by its height, but it sits at the foot of the screen: on a
   * 375x667 phone, a 360x640 one and a tablet held sideways it came up over
   * the button that sends the PIN - the only way on - and over the last of
   * the PIN row, and the child had to know to scroll. So when it comes up,
   * the page scrolls by the least that puts the button just above it, which
   * keeps the PIN row in view too. Where everything already clears it, as on
   * an upright tablet, nothing moves and the frame's spacing stands.
   */
  const submitRef = useRef<HTMLButtonElement>(null);
  const padRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pad.open) return;
    const button = submitRef.current?.getBoundingClientRect();
    const keys = padRef.current?.getBoundingClientRect();
    // No height: the pad is hidden, because a real keyboard is attached.
    if (!button || !keys || keys.height === 0) return;
    const by = scrollToClearPad(button.bottom, keys.top);
    if (by > 0) window.scrollBy({ top: by });
  }, [pad.open]);

  /*
   * ONE APPENDER for the pad and the keyboard. They filled `digits` through
   * two separate inline closures before this screen had a keyboard path at
   * all; two copies of "add a digit unless we are full" is how they end up
   * disagreeing about the cap.
   */
  const addDigits = useCallback((raw: string) => {
    const add = raw.replace(/[^0-9]/g, "");
    if (!add) return;
    setError(null);
    /*
     * FOUR DIGITS, FOUR BOXES (D58, 6 Oct). This took up to eight, for a
     * PIN that might be six from before 25 Sep; design: "SCRUM-179 settles
     * it and the six-digit reference is stale wherever it appears." Five to
     * eight were only ever a 422.
     */
    setDigits((d) => (d + add).slice(0, STUDENT_PIN_LENGTH));
  }, []);

  /*
   * THE CODE CELLS, as 05 Entry types into them: each character moves on to
   * the next cell and the fourth to the Student ID, Backspace in an empty
   * cell goes back one, and a pasted code spreads across all four.
   */
  const typeIntoCell = (i: number, raw: string) => {
    if (raw === "") {
      if (!code[i]) return;
      const next = code.slice();
      next[i] = "";
      setCode(next);
      return;
    }
    const placed = placeSchoolCode(code, i, raw);
    // A 0, an O or a symbol: nothing belongs in the code, so nothing moves.
    if (placed.last === null) return;
    setCode(placed.cells);
    if (placed.last < SCHOOL_CODE_LENGTH - 1) {
      cellRefs.current[placed.last + 1]?.focus();
    } else {
      idRef.current?.focus();
    }
  };
  const backspaceCell = (i: number) => {
    const at = code[i] ? i : i - 1;
    if (at < 0) return;
    const next = code.slice();
    next[at] = "";
    setCode(next);
    if (at !== i) cellRefs.current[at]?.focus();
  };

  const identifier = username.trim();
  const school = code.join("");
  const ready =
    school.length === SCHOOL_CODE_LENGTH &&
    identifier.length >= USERNAME_MIN &&
    digits.length === STUDENT_PIN_LENGTH;

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
        setWrongDoor(studentDoorRefusal(session.role));
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
      const failure = classifyLearnerLoginFailure(cause);
      /*
       * A failure "Try again" answers keeps all three as typed - the four PIN
       * dots too, and the button live (00c, state 3). It cleared the PIN and
       * greyed the button out at 40%, under a "Try again" that could not be
       * pressed. The other failures are screens or pauses of their own, where
       * the PIN is not coming back.
       */
      if (failure !== "credentials" && failure !== "ours") setDigits("");
      // D178: if this device remembers them, their tile leaves its picker
      // now, not in thirty days. One the device never knew is not added.
      if (failure === "closed") {
        closeRememberedChild({ schoolCode: school, loginIdentifier: identifier });
      }
      setError(failure);
    } finally {
      if (!leaving) setChecking(false);
    }
  }, [ready, checking, school, identifier, digits, signIn, next, goOn]);

  /*
   * A paused account takes the whole screen, exactly as it does at the PIN
   * unlock. There is nothing here a child can do, and leaving the form
   * underneath would invite them to keep trying something that cannot work.
   * A closed account is 28d, never on pause (D53, D116), with no sign-in
   * route on it - only its line to the picker for whoever is next (7 Oct).
   */
  if (error === "closed") {
    return <AccountClosedScreen toPicker={{ href: "/auth/login" }} />;
  }
  if (error === "paused") {
    // No retry, but a way back to the picker for whoever is next (D52).
    return <AccountOnPauseScreen back={{ href: "/auth/login" }} />;
  }
  /*
   * D128: a parent, or an account we do not recognise, gets a screen of its
   * own. Either way back is this form, with what they typed kept and the PIN
   * cleared, as after "didn't match".
   */
  if (error === "wrong_door" && wrongDoor && wrongDoor !== "staff") {
    return <WrongDoorScreen kind={wrongDoor} onBack={() => setError(null)} />;
  }

  if (done) {
    /*
     * 00c's success (state 2): the form's wordmark stays, and the avatar disc
     * pops in above the greeting. It was the generic check-mark beat, with no
     * wordmark, which is another screen's.
     */
    return (
      <main className="flex min-h-[100dvh] w-full flex-col bg-nevo-cream text-nevo-near-black">
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-7 pt-[52px] pb-6 text-center sm:px-12 sm:pt-14 sm:pb-8">
          <Wordmark size="form" />
          <span
            aria-hidden
            className="mt-7 flex size-16 items-center justify-center rounded-full bg-nevo-navy motion-safe:animate-nevo-pop"
          >
            <svg viewBox="0 0 24 24" className="size-[46%] fill-nevo-cream">
              <circle cx="12" cy="12" r="8.5" />
            </svg>
          </span>
          <h2 className="mt-5 text-2xl leading-[1.25] font-medium tracking-[-0.01em] sm:text-[28px]">
            {/*
              NEVER THE USERNAME. This read "Welcome back, amara.k" - the login
              identifier, on a shared tablet, beside a school code the whole
              building knows. The first name arrives inside this 1.2s hold in
              the ordinary case; until it does, "Welcome back" is warm and true.
            */}
            {greetName ? `Welcome back, ${greetName}` : "Welcome back"}
          </h2>
          <p className="mt-2.5 text-[15px] leading-[1.4] text-nevo-near-black/60 sm:text-base">
            Taking you to your lessons…
          </p>
        </div>
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
  /**
   * D154's pause, which "holds everywhere a child enters a PIN": the PIN
   * boxes held, the note in the error box's place, and "Forgot PIN?" raised
   * where the button was. 00c draws no Forgot PIN of its own; on a device
   * that remembers nobody it explains who clears a PIN and leads back to a
   * door, which is where the pause ends. The fields stay as typed.
   */
  const throttled = error === "throttled";

  return (
    <main className="flex min-h-[100dvh] w-full flex-col bg-nevo-cream text-nevo-near-black">
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col items-center px-7 pt-[52px] text-center sm:px-12 sm:pt-14",
          // The frame lifts the form to the top while a keyboard is up, so
          // the field being typed into and the button stay above it.
          pad.open || codeKeys.open
            ? "justify-start pb-5"
            : "justify-center pb-6 sm:pb-8",
        )}
      >
        <Wordmark size="form" />

        {/* 00c's words. It read "Sign back in", with the help folded into a
            line under the heading. */}
        <h1 className="mt-[26px] text-2xl leading-[1.25] font-medium tracking-[-0.01em] sm:text-[28px]">
          {throttled ? THROTTLED_PAUSE_COPY.heading : "Welcome back"}
        </h1>
        {!throttled && (
          <p className="mt-2.5 text-[15px] leading-[1.4] text-nevo-near-black/60 sm:text-base">
            Let&apos;s get you back into your lessons.
          </p>
        )}

        <div className="mt-7 flex w-full max-w-[336px] flex-col gap-[18px] text-left sm:gap-5">
          <div className="flex flex-col gap-2">
            {/*
              A VISIBLE label: there are three fields in a row, and a child
              being read a code and a username by their teacher has to know
              which box takes which.
            */}
            <label
              id="returning-code-label"
              htmlFor="returning-code-0"
              className="text-[13px] font-semibold text-nevo-near-black/70 sm:text-[13.5px]"
            >
              Your school code
            </label>
            {/*
              00c's four underline cells, centred in the frame's field shell.
              No placeholder and no tint on a miss: the frame draws neither,
              and its error line says what to check.
            */}
            <div
              role="group"
              aria-labelledby="returning-code-label"
              className={cn(FIELD_SHELL, "justify-center gap-2.5")}
            >
              {code.map((ch, i) => (
                <input
                  key={i}
                  id={`returning-code-${i}`}
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
                      void submit();
                    }
                  }}
                  onFocus={(e) => {
                    // Typing over a filled cell replaces it.
                    e.currentTarget.select();
                    openCodeKeys(i);
                  }}
                  // A tap on a cell that already has focus fires no focus
                  // event; it still brings the tray up.
                  onPointerDown={() => openCodeKeys(i)}
                  onBlur={codeKeys.onBlur}
                  // A fresh arrival starts here; a child handed over from 05
                  // starts at the PIN.
                  autoFocus={i === 0 && !handedOver}
                  // The Nevo keyboard is the input on touch (A.12); a hardware
                  // keyboard still types on desktop, where the tray is hidden.
                  inputMode="none"
                  autoComplete="off"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-label={`School code, character ${i + 1} of ${SCHOOL_CODE_LENGTH}`}
                  // No `outline-none`, here or on the Student ID: it hid
                  // which cell takes the next character from anyone on a
                  // keyboard. Neither frame draws a focus state, so the
                  // student console's focus ring shows it, as on 05.
                  className="h-8 w-[26px] rounded-none border-0 border-b-2 border-nevo-near-black/28 bg-transparent p-0 text-center text-[21px] font-bold text-nevo-near-black uppercase sm:h-9 sm:w-[30px] sm:text-2xl"
                />
              ))}
            </div>
          </div>
          {/*
            NOT THE CODE'S RULE, deliberately. The code cells keep only what a
            school code can contain, which is right for a code and destroys an
            identifier: `amara.k` would arrive as `AMARAK`, and `BGA/2031` as
            `BGA2031`, which the server has never heard of. What the child
            types is sent back exactly as typed.

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
            <div className={FIELD_SHELL}>
              <input
                id="returning-username"
                ref={idRef}
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
                className="h-full w-full bg-transparent text-base text-nevo-near-black"
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
            {throttled ? (
              <HeldPinBoxes boxClassName="size-[58px] sm:size-[66px]" />
            ) : (
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
                onFocus={() => {
                  codeKeys.close();
                  pad.onFocus();
                }}
                onBlur={pad.onBlur}
                autoFocus={handedOver}
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
                {/* Four boxes, for every child (D58), in the one box every
                    PIN screen draws (D177). A miss recolours none of them
                    (D199): the line under the fields says it. */}
                {Array.from({ length: STUDENT_PIN_LENGTH }, (_, i) => {
                  // The caret's box, while the PIN is what is being typed:
                  // not while a code cell or the Student ID has focus. 00c
                  // draws its caret 2px.
                  const caret = pad.open && i === digits.length && !checking;
                  return (
                    <PinBox
                      key={i}
                      filled={digits.length > i}
                      caret={caret}
                      className={cn(
                        "size-[58px] sm:size-[66px]",
                        caret && "border-2",
                      )}
                      dotClassName="size-[13px] sm:size-3.5"
                    />
                  );
                })}
              </div>
            </div>
            )}
          </div>

          {throttled && <ThrottleNote className="mt-0 max-w-none" />}

          {/*
            00c's error: a soft violet box with an info mark, the fields kept
            filled. It was a plain violet line with nothing to anchor it.
          */}
          {error && !throttled && (
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
                {/* 28c's door lines (D68), the same on every PIN door. A
                    rate limit is D154's pause, never a line here. */}
                {error === "ours" && SIGN_IN_OURS_COPY}
                {error === "wrong_door" && <WrongDoorNote />}
              </span>
            </div>
          )}

          {throttled ? (
            <Link
              href={withNext("/auth/forgot-pin", next)}
              className={cn(RAISED_FORGOT, "mt-1 w-full")}
            >
              {THROTTLED_PAUSE_COPY.forgot}
            </Link>
          ) : (
          <button
            ref={submitRef}
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
          )}

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

      {pad.open && !throttled && (
        // Docked, and in the flow rather than fixed over it: the page grows by
        // the tray's height, so nothing it docks over is out of reach. The
        // wrapper is what is measured above - the tray inside slides up, and a
        // transform would move its box mid-measure.
        <div ref={padRef} className="sticky bottom-0 z-40">
          <NevoKeyboard
            layout="pad"
            onKey={(char) => {
              if (checking) return;
              addDigits(char);
            }}
            onBackspace={() => setDigits((d) => d.slice(0, -1))}
          />
        </div>
      )}
      {codeKeys.open && !throttled && (
        <NevoKeyboard
          layout="qwerty"
          // A school code is capitals, so its tray stays in capitals.
          uppercase
          onKey={(char) => {
            const at = activeCell.current;
            if (at !== null) typeIntoCell(at, char);
          }}
          onBackspace={() => {
            const at = activeCell.current;
            if (at !== null) backspaceCell(at);
          }}
          onReturn={() => void submit()}
          // Docked in the flow like the pad: it used to be fixed over the
          // foot of the form, on top of the help row.
          className="sticky bottom-0 z-40"
        />
      )}
    </main>
  );
}
