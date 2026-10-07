"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { NevoKeyboard } from "@/components/shared";
import { Wordmark } from "@/components/shared/BrandMarks";
import { authApi } from "@/lib/api";
import {
  classifyLearnerLoginFailure,
  type LearnerLoginFailure,
} from "@/lib/auth/loginFailure";
import {
  doorForRole,
  knownRole,
  type ConsoleDoor,
} from "@/lib/auth/consoleDoor";
import { safeNextPath, withNext } from "@/lib/auth/nextPath";
import { AccountClosedScreen } from "@/components/student/Auth/AccountClosedScreen";
import { AccountOnPauseScreen } from "@/components/student/Auth/AccountOnPauseScreen";
import { WrongDoorNote } from "@/components/student/Auth/WrongDoorNote";
import {
  childById,
  pickerEntries,
  rememberChild,
  type PickerEntry,
  type RememberedChild,
} from "@/lib/auth/deviceRoster";
import { ChildAvatar } from "@/components/student/Auth/ChildAvatar";
import { ProfilePicker } from "@/components/student/Auth/ProfilePicker";
import { useAuth } from "@/hooks";
import { studentDestination } from "@/lib/auth/entryGate";
import { SignedInHereScreen } from "@/components/student/Auth/SignedInHereScreen";
import {
  SIGN_IN_OURS_COPY,
  SIGN_IN_THROTTLED_COPY,
  skipsWelcomeBeat,
} from "@/components/student/Auth/signInMoments";
import { STUDENT_PIN_LENGTH } from "@/lib/constants";
import { cn } from "@/lib/utils";
/** The frame's done beat before navigating home. */
const DONE_MS = 700;

/**
 * The lock screen's greeting, which must survive not knowing who they are.
 *
 * `displayName` is optional on a remembered profile: a PIN login returns a
 * session rather than a profile, so a child who signed in on an unrecognised
 * device may be remembered without a name. This used to be papered over by
 * storing their LOGIN IDENTIFIER as the name, which put half a credential on a
 * pre-authentication screen beside a school code the whole building knows.
 *
 * A bare "Welcome back" is the right nameless state. It is warm, it is true,
 * and it tells a passer-by nothing about whose tablet this is.
 */
function greeting(displayName?: string): string {
  const name = displayName?.trim();
  return name ? `Welcome back, ${name}` : "Welcome back";
}

/**
 * The PIN step's heading: the child's first name and nothing else (28c-3 draws
 * "Ada"), or 28c's own nameless state, "Welcome back", when the device never
 * learned it.
 */
function pinHeading(displayName?: string): string {
  return displayName?.trim() || "Welcome back";
}

/**
 * Where "Forgot PIN?" goes: 00a, told WHICH remembered child forgot by the
 * roster's opaque id - never the identifier or the school code, which stay on
 * the device - so its "Let my teacher know" can ask for that child.
 */
function forgotPinHref(childId: string, next: string | undefined): string {
  const query = new URLSearchParams();
  if (next) query.set("next", next);
  query.set("child", childId);
  return `/auth/forgot-pin?${query}`;
}

/**
 * The student door, in two beats: WHO, then the PIN (frames 00 and 28c).
 *
 * THIS USED TO REMEMBER EXACTLY ONE CHILD, which on a classroom tablet is the
 * bug 28c exists to fix: the next child found somebody else's name on the lock
 * screen, and their only way forward was a second account with no history and a
 * class they might not be able to rejoin. The device now remembers up to six,
 * and this screen asks which of them is here.
 *
 * ONE REMEMBERED CHILD STILL GETS THE PICKER (D57, 6 Oct). This used to open
 * a one-child device straight on 00's own-device PIN screen, "Welcome back,
 * Ada" with "Using a different device?", on the reading that one child meant
 * the child's own tablet. Design: "One remembered child means one child has
 * used this device, not that it belongs to them. Every shared tablet starts
 * with exactly one remembered child. Device ownership is never inferred from
 * use, so the picker still shows." So the count decides nothing but whether
 * there is anyone to pick.
 *
 * A device that remembers NOBODY shows 28c-2: the wordmark and one "Sign in",
 * which goes to the full sign-in (00c). This used to redirect there instead,
 * reading the caption "no one remembered - straight to sign-in" as the whole
 * instruction; the frame draws the neutral screen the caption labels, and a
 * shared tablet with nobody on it should not open on a form.
 *
 * WHERE THE CHILD WAS GOING TRAVELS WITH THEM. The proxy puts it in `?next=`,
 * and this screen used to read it only on the empty-device redirect: the PIN
 * unlock landed on Home, and "Someone else" and "Forgot PIN?" dropped it.
 *
 * The PIN beat (28c-3): the child's shape and first name, four boxes (D58),
 * the block pad beside the boxes in landscape and under them in portrait -
 * "every screen is drawn in portrait and landscape, because tray-mounted
 * tablets cannot be rotated" - and a pop-check "Welcome back" before the
 * dashboard. A full PIN submits to POST /auth/login/pin; a rejected one clears
 * the boxes and says so in 28c-5's tinted line. A failure that is NOT about
 * the child's PIN says so instead - see `error`.
 */
export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useAuth();
  /** Null until the client has read localStorage - never during SSR. */
  const [entries, setEntries] = useState<PickerEntry[] | null>(null);
  /** The child whose PIN we are asking for. Null means the picker is up. */
  const [chosen, setChosen] = useState<RememberedChild | null>(null);
  const [digits, setDigits] = useState("");
  /**
   * What went wrong, not merely THAT something did.
   *
   * "credentials" is the child's PIN being wrong. "ours" is everything else -
   * a malformed request, a school code that no longer resolves, a server that
   * did not answer. All of those used to render as "That PIN didn't match",
   * which blames a child for our fault and hides the real cause: a 6-digit
   * PIN truncated to 4 read exactly like a wrong PIN, and cost an evening.
   *
   * A 401 IS NO LONGER ONE THING. Backend now names which, in the 401's own
   * documented description: `authentication_failed` when the credential is
   * wrong, `account_paused` when it is RIGHT but the account is not open, and
   * `too_many_attempts` when rate limited. Collapsing all three into
   * "credentials" told a paused child and a rate-limited child that they had
   * mistyped - the same blame-the-child shape, for two more causes.
   *
   * "paused" takes over the whole screen rather than adding a line, because the
   * PIN row underneath it would be an invitation to keep trying something that
   * cannot work.
   *
   * An UNRECOGNISED code falls back to "credentials", which is the honest
   * default for a 401: the server rejected these credentials and did not say
   * why. The set is not closed - the session-validation codes are not in the
   * document at all - so this must never assume it has seen them all.
   */
  const [error, setError] = useState<LearnerLoginFailure | null>(null);
  const [checking, setChecking] = useState(false);
  const [done, setDone] = useState(false);
  /**
   * Where the child goes once they have read that this sign-in ended their
   * session elsewhere (D59, `SignedInHereScreen`). Null when it ended nothing.
   */
  const [releasedTo, setReleasedTo] = useState<string | null>(null);
  /** Whose door a non-student account belongs at; see `WrongDoorNote`. */
  const [wrongDoor, setWrongDoor] = useState<ConsoleDoor | null>(null);
  /**
   * Where the child was going, from the proxy's `?next=` - for every way out of
   * this screen, not only the empty-device one it used to be read for.
   */
  const [next, setNext] = useState<string | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Sync from the device's roster and the address (both client-only). Read
    // from `location` rather than `useSearchParams` - this is already a
    // client-only effect, and the hook would demand a Suspense boundary for a
    // value read once.
    const hydrate = () => {
      setNext(
        safeNextPath(new URLSearchParams(window.location.search).get("next")),
      );
      /*
       * An EMPTY roster is a state, not a redirect: 28c-2 draws it. It is
       * still never onboarding - that used to make a RETURNING child create a
       * second account: new identifier, no history, and a class they might not
       * be able to rejoin. Its "Sign in" goes to 00c, which carries "I'm new
       * to Nevo" for the children who really are.
       */
      // One child or six, the picker comes first (D57). See the docblock.
      setEntries(pickerEntries());
    };
    hydrate();
  }, []);

  useEffect(
    () => () => {
      if (doneTimer.current) clearTimeout(doneTimer.current);
    },
    [],
  );

  /*
   * PUT THE CARET WHERE A LAPTOP'S KEYSTROKES WILL LAND.
   *
   * The PIN boxes are not an input - they are drawn from `digits`, and the
   * thing that actually receives typing is the off-screen field below. Nothing
   * focused it, so on any device with a real keyboard the screen looked ready
   * and swallowed every keystroke until the child happened to click the page.
   * There is no cue to do that, because on a tablet - where this screen was
   * designed and tested - you tap the pad and never need one.
   *
   * It has been that way since the screen shipped. The picker made it look
   * like a new fault rather than an old one: choosing a face IS a click, so it
   * feels like the page should now be listening, and the click is consumed by
   * the tile instead.
   *
   * `preventScroll` because the field sits at -9999px, and focusing it without
   * that scrolls the whole page sideways to reveal it.
   *
   * Safe on touch: `inputMode="none"` is what stops the OS keyboard appearing,
   * and it is why the field can hold focus without covering the screen.
   */
  useEffect(() => {
    if (!chosen || done) return;
    inputRef.current?.focus({ preventScroll: true });
  }, [chosen, done]);

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

  const submit = useCallback(
    async (pin: string, remembered: RememberedChild) => {
      setChecking(true);
      setError(null);
      // Leaving for the waiting screen: the boxes stay checking until it lands.
      let leaving = false;
      try {
        const session = await authApi.loginPin({
          schoolCode: remembered.schoolCode,
          // What the device remembered, as it was - a handle or a Student ID.
          admissionNumber: remembered.loginIdentifier,
          pin,
        });
        /*
         * REFUSE AT THE DOOR, NOT AFTER IT - what the admin and teacher doors
         * have done since 23 Sep. This cast `session.role` into the session,
         * so a non-student account was stored, greeted and pushed at the
         * student app for the proxy to bounce. `knownRole`/`doorForRole` are
         * the guard's own rule, so the two cannot disagree. The login did
         * succeed, so the session it made is ended rather than left behind.
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
        signIn({
          id: session.userId,
          role,
          schoolId: remembered.schoolCode,
          name: remembered.displayName,
          method: "manual",
        });
        // Move them to the front of the roster and restamp the thirty-day
        // clock. Done on SUCCESS only: a wrong PIN is not a visit, and letting
        // it count would keep a child who has left the school on the tablet
        // indefinitely.
        rememberChild({
          ...remembered,
          // Which account this entry is, so a signed-in screen can find it.
          userId: session.userId,
        });
        /*
         * The remembered-device door resolves consent like every other one -
         * design, 23 Sep: a child in the same state meets the same screen
         * whichever door they use. And to where they were going, which this
         * door used to drop.
         *
         * RESOLVED BEFORE THE BEAT, NOT INSIDE IT (D2). A child about to be
         * held never sees "Taking you to your lessons", because it is not
         * true: they go straight to the waiting screen. The boxes stay in
         * their checking state for the one read this costs.
         */
        const destination = await studentDestination(next);
        // D59 first, when this ended a session elsewhere; its Continue goes on.
        if (session.replacedSession === true) {
          setReleasedTo(destination);
          return;
        }
        leaving = goOn(destination);
      } catch (cause) {
        setDigits("");
        // 401/403 is the server's answer about these credentials. A 422 means
        // we sent a shape it rejects - the PIN length is the live example -
        // and anything else is the network or the server. Only the first is
        // about the child.
        setError(classifyLearnerLoginFailure(cause));
      } finally {
        if (!leaving) setChecking(false);
      }
    },
    [signIn, next, goOn],
  );

  /*
   * FOUR DIGITS, FOUR BOXES (D58, 6 Oct). The boxes fill and submit
   * themselves on the fourth digit, for every child.
   *
   * This used to draw whatever length the device remembered for the child -
   * six for one it predated - and after a PIN that did not match, grew boxes
   * up to eight until the pad's return key said done. Design: "SCRUM-179
   * settles it and the six-digit reference is stale wherever it appears." A
   * PIN is chosen at four (`PinChoice`, `StudentPinSetup`), and five to eight
   * digits were only ever a 422 from the server.
   */
  const addDigits = useCallback(
    (raw: string) => {
      if (done || checking || !chosen) return;
      const add = raw.replace(/[^0-9]/g, "");
      if (!add) return;
      setError(null);
      setDigits((prev) => {
        const next = (prev + add).slice(0, STUDENT_PIN_LENGTH);
        if (next.length === STUDENT_PIN_LENGTH) void submit(next, chosen);
        return next;
      });
    },
    [done, checking, chosen, submit],
  );

  /**
   * "That's all of it" - the pad's return key, or Enter. Only ever four
   * digits; anything shorter is a shape the server refuses before it looks at
   * the PIN.
   */
  const submitTyped = useCallback(() => {
    if (done || checking || !chosen || digits.length !== STUDENT_PIN_LENGTH)
      return;
    void submit(digits, chosen);
  }, [done, checking, chosen, digits, submit]);

  const backspace = useCallback(() => {
    setError(null);
    setDigits((prev) => prev.slice(0, -1));
  }, []);

  // The client has not read the roster yet. The server cannot see localStorage,
  // so drawing anything here would flash it at whoever is holding the tablet.
  if (!entries) return null;

  if (entries.length === 0) {
    /*
     * 28c-2, "No one remembered": the wordmark and one way on. Nothing about
     * who has used this tablet, because nobody has that the device knows of.
     */
    return (
      <main className="flex min-h-dvh w-full flex-col items-center justify-center bg-nevo-cream px-14 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-400">
        <Wordmark size="door" />
        <Link
          href={withNext("/auth/sign-in", next)}
          className="mt-12 inline-flex h-[58px] w-full max-w-[340px] cursor-pointer items-center justify-center rounded-[10px] bg-nevo-navy text-[17px] font-semibold text-nevo-cream transition-[filter] hover:brightness-108 active:scale-[0.97] motion-reduce:transform-none landscape:mt-11 landscape:h-14 landscape:max-w-[320px]"
        >
          Sign in
        </Link>
      </main>
    );
  }

  if (!chosen) {
    return (
      <main className="min-h-dvh w-full bg-nevo-cream">
        <ProfilePicker
          entries={entries}
          onChoose={(id) => {
            // Re-read rather than trusting a row: the roster may have aged out
            // or been rewritten in another tab since it was drawn.
            const child = childById(id);
            if (!child) {
              setEntries(pickerEntries());
              return;
            }
            setDigits("");
            setError(null);
            setChosen(child);
          }}
          someoneElseHref={withNext("/auth/sign-in", next)}
        />
      </main>
    );
  }

  /*
   * A paused account takes the whole screen, per the frame: it is shown "in
   * place of the normal login flow", not as a line under a PIN row the child
   * could keep tapping at. Rendered here rather than routed to, deliberately -
   * a `/auth/paused` URL would be a screen anyone could visit and be told their
   * account is on pause when it is not.
   *
   * Its way back (D52) is to the picker, so the next child can get in.
   *
   * A closed account is 28d, never on pause (D53, D116), and terminal: the
   * frame draws no sign-in route on it.
   */
  if (error === "closed") return <AccountClosedScreen />;
  if (error === "paused") {
    return (
      <AccountOnPauseScreen
        back={{
          onBack: () => {
            setError(null);
            setDigits("");
            setChosen(null);
          },
        }}
      />
    );
  }

  const focusInput = () => inputRef.current?.focus();

  if (done) {
    return (
      <main className="flex min-h-[100dvh] w-full flex-col items-center justify-center bg-nevo-cream px-10 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-nevo-navy motion-safe:animate-nevo-pop">
          <Check className="size-[34px] text-nevo-cream" strokeWidth={2.6} />
        </span>
        <h2 className="mt-5 text-[23px] leading-[1.3] font-medium tracking-[-0.01em] text-nevo-near-black sm:text-[26px]">
          {greeting(chosen.displayName)}
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
   * "Not you? Go back" - 28c-3 puts it under the pad in portrait and under the
   * name in landscape. One element, placed by the grid below, so there is only
   * ever one of it for a keyboard or a screen reader to find.
   *
   * It goes BACK TO THE PICKER rather than out to the full sign-in, which is
   * what this button used to do as "Using a different device?". A child who
   * tapped the wrong face wants the other five faces, not a school code and a
   * username they may not know by heart. The route out to a full sign-in still
   * exists, one step further on, as the picker's "Someone else".
   *
   * There is always a picker to go back to, one remembered child included
   * (D57), so 00's "Using a different device?" no longer stands in this slot.
   */
  const notYou = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setChosen(null);
        setDigits("");
        setError(null);
      }}
      className="mt-7 inline-flex h-[46px] cursor-pointer items-center rounded-[10px] px-[18px] text-base font-medium text-nevo-navy transition-[background] hover:bg-nevo-navy/8 lg:landscape:col-start-1 lg:landscape:row-start-3 lg:landscape:justify-self-center"
    >
      Not you? Go back
    </button>
  );

  return (
    <main
      onClick={focusInput}
      className="flex min-h-[100dvh] w-full cursor-text flex-col bg-nevo-cream"
    >
      {/* Hidden input - hardware keyboards type here; the pad drives touch. */}
      <input
        ref={inputRef}
        value=""
        onChange={(e) => {
          addDigits(e.target.value);
          e.target.value = "";
        }}
        onKeyDown={(e) => {
          if (e.key === "Backspace") {
            e.preventDefault();
            backspace();
          }
          if (e.key === "Enter") {
            e.preventDefault();
            submitTyped();
          }
        }}
        inputMode="none"
        aria-label="PIN"
        className="pointer-events-none absolute -left-[9999px] opacity-0"
      />

      {/*
        ONE COLUMN IN PORTRAIT, TWO IN LANDSCAPE (28c-3). It was one column
        everywhere, so on a 1024x768 tray-mounted tablet - which cannot be
        turned - the pad and "Not you?" fell below the fold. Landscape puts
        the child on the left and the PIN on the right; the 1fr rows above and
        below keep the left column centred against the taller right one.

        No wordmark on 28c-3: the picker before it carries the mark.
      */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-10 pt-10 pb-6 text-center sm:px-14 lg:landscape:grid lg:landscape:grid-cols-[auto_auto] lg:landscape:grid-rows-[1fr_auto_auto_1fr] lg:landscape:content-center lg:landscape:gap-x-20 lg:landscape:px-[72px] lg:landscape:pt-9 lg:landscape:pb-[18px]">
        <div className="flex flex-col items-center lg:landscape:col-start-1 lg:landscape:row-start-2">
          {/*
            The child's shape, never their initials. 28c: avatars are "soft
            geometric shapes, never a face", and initials on a screen anyone
            in the room can see name a child to a stranger just as well as a
            face does.
          */}
          <ChildAvatar
            shapeIndex={chosen.shapeIndex}
            className="size-[104px] sm:size-[120px] lg:landscape:size-[132px]"
          />
          <h2 className="mt-6 text-[24px] font-semibold tracking-[-0.01em] text-nevo-near-black sm:text-[28px] lg:landscape:mt-[22px] lg:landscape:text-[30px]">
            {/* 28c-3 names ("Ada"). */}
            {pinHeading(chosen.displayName)}
          </h2>
        </div>

        <div className="flex flex-col items-center lg:landscape:col-start-2 lg:landscape:row-span-4 lg:landscape:row-start-1 lg:landscape:self-center">
          {/*
            28c-5 puts "That PIN didn't match" WHERE "Enter your PIN" was, in a
            soft violet box - calm, never red, and not an extra line pushing
            the pad down.
          */}
          {error ? (
            <div
              role="status"
              className="mt-[22px] max-w-[360px] rounded-[10px] bg-nevo-violet/18 px-4 py-[13px] text-[15.5px] leading-[1.5] text-nevo-near-black lg:landscape:mt-0 lg:landscape:max-w-[340px] lg:landscape:px-[15px] lg:landscape:py-3 lg:landscape:text-[15px]"
            >
              {/* 28c-5's own words. */}
              {error === "credentials" &&
                "That PIN didn't match. Have another go."}
              {/* 28c-6, 28c-7 and 28c-8 (D68), in the same box. The rate
                  limit must never read as a wrong PIN: the child may have
                  typed the right one too quickly. */}
              {error === "ours" && SIGN_IN_OURS_COPY}
              {error === "throttled" && SIGN_IN_THROTTLED_COPY}
              {error === "wrong_door" && <WrongDoorNote door={wrongDoor} />}
            </div>
          ) : (
            <p
              role="status"
              className="mt-2.5 text-[15px] text-nevo-near-black/60 sm:text-[17px] lg:landscape:mt-0"
            >
              Enter your PIN to keep going
            </p>
          )}
          {/* Four, for every child (D58). */}
          <div className="mt-8 flex flex-wrap justify-center gap-3.5 sm:mt-[34px] sm:gap-4 lg:landscape:mt-[26px]">
            {Array.from({ length: STUDENT_PIN_LENGTH }, (_, i) => {
              const active = i === digits.length && !checking;
              return (
                <div
                  key={i}
                  className={cn(
                    "flex size-12 items-center justify-center rounded-[10px] border-[1.5px] bg-nevo-cream shadow-[0_2px_8px_rgba(0,0,0,0.05)] sm:size-[58px]",
                    active
                      ? "border-nevo-navy"
                      : error
                        ? "border-nevo-violet"
                        : "border-nevo-near-black/20",
                  )}
                >
                  {digits.length > i && (
                    <span className="block size-3 rounded-full bg-nevo-near-black sm:size-[13px]" />
                  )}
                </div>
              );
            })}
          </div>
          {/*
            THE PAD SITS IN THE SCREEN, under the boxes it fills in portrait and
            beside the child in landscape, exactly where 28c-3 draws it.

            It used to be a docked tray summoned by focusing a hidden input,
            which is the right shape for a field a keyboard would cover and
            the wrong one for four boxes with nothing beneath them. A child
            had to tap the screen before they could see how to answer it.
            Nothing summons this one, so there is nothing to miss.
          */}
          <NevoKeyboard
            layout="pad"
            presentation="block"
            onKey={addDigits}
            onBackspace={backspace}
            onDone={submitTyped}
            className="mt-[30px] lg:landscape:mt-6"
          />

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              router.push(forgotPinHref(chosen.id, next));
            }}
            className="mt-2 h-11 cursor-pointer px-4 text-[15px] font-medium text-nevo-navy"
          >
            Forgot PIN?
          </button>
        </div>

        {notYou}
      </div>
    </main>
  );
}
