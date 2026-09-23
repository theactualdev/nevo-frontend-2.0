"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { NevoKeyboard } from "@/components/shared";
import { authApi } from "@/lib/api";
import {
  classifyLoginFailure,
  type LoginFailure,
} from "@/lib/auth/loginFailure";
import { safeNextPath } from "@/lib/auth/nextPath";
import { AccountOnPauseScreen } from "@/components/student/Auth/AccountOnPauseScreen";
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
import { STUDENT_PIN_LENGTH, type UserRole } from "@/lib/constants";
import { cn } from "@/lib/utils";

// The length the screens commit to - see `STUDENT_PIN_LENGTH` for why this is
// one number and not the contract's 4-8 range.
const PIN_LENGTH = STUDENT_PIN_LENGTH;
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
 * The student door, in two beats: WHO, then the PIN (frames 00 and 28c).
 *
 * THIS USED TO REMEMBER EXACTLY ONE CHILD, which on a classroom tablet is the
 * bug 28c exists to fix: the next child found somebody else's name on the lock
 * screen, and their only way forward was a second account with no history and a
 * class they might not be able to rejoin. The device now remembers up to six,
 * and this screen asks which of them is here.
 *
 * THE PICKER SHOWS EVEN FOR A SINGLE REMEMBERED CHILD, which costs one tap on a
 * one-child device. That is deliberate: 28c exists to replace "the
 * single-identity lock screen that kept the last child's name and face on an
 * unauthenticated screen", and going straight to a named PIN screen for one
 * child IS that screen. Flagged to design rather than optimised away.
 *
 * A device that remembers NOBODY still routes straight to the full sign-in -
 * the frame's own caption for 28c-2 is "no one remembered - straight to
 * sign-in", so the drawn neutral screen is the state, not an extra tap.
 *
 * The PIN beat itself is unchanged: one box per digit, the Nevo pad on touch, a
 * calm violet error line - never red - and a pop-check "Welcome back" before
 * the dashboard. A full PIN submits to POST /auth/login/pin; a rejected one
 * clears the boxes. A failure that is NOT about the child's PIN says so
 * instead - see `error`.
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
  const [error, setError] = useState<LoginFailure | null>(null);
  const [checking, setChecking] = useState(false);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Sync from the device's roster (localStorage, client-only).
    const hydrate = () => {
      const remembered = pickerEntries();
      if (remembered.length === 0) {
        /*
         * Nothing to unlock on this device - so ask who they are, rather than
         * assuming they are new.
         *
         * This used to `replace("/student/onboarding")`, which made a RETURNING
         * child create a second account: new identifier, no history, and a class
         * they might not be able to rejoin. It happened on a cleared browser, a
         * new tablet, a reimaged school laptop, and on any shared tablet where
         * another child onboarded after them - the device remembers exactly one.
         * Nothing told them or their teacher.
         *
         * Frame 00c is the door. It carries "I'm new to Nevo" for the children
         * who really are, which is why removing this redirect loses nothing.
         */
        // The proxy sets `?next=` when it bounces a signed-out child off a
        // student route. This screen has never read it; carrying it across
        // means the sign-in lands them where they were going. Read from
        // `location` rather than `useSearchParams` - this is already a
        // client-only effect, and the hook would demand a Suspense boundary
        // for a value we only need here.
        const wanted = safeNextPath(
          new URLSearchParams(window.location.search).get("next"),
        );
        router.replace(
          wanted
            ? `/auth/sign-in?next=${encodeURIComponent(wanted)}`
            : "/auth/sign-in",
        );
        return;
      }
      setEntries(remembered);
    };
    hydrate();
  }, [router]);

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

  const submit = useCallback(
    async (pin: string, remembered: RememberedChild) => {
      setChecking(true);
      setError(null);
      try {
        const session = await authApi.loginPin({
          schoolCode: remembered.schoolCode,
          loginIdentifier: remembered.loginIdentifier,
          pin,
        });
        signIn({
          id: session.userId,
          role: session.role as UserRole,
          schoolId: remembered.schoolCode,
          name: remembered.displayName,
          method: "manual",
        });
        // Move them to the front of the roster and restamp the thirty-day
        // clock. Done on SUCCESS only: a wrong PIN is not a visit, and letting
        // it count would keep a child who has left the school on the tablet
        // indefinitely.
        rememberChild(remembered);
        setDone(true);
        /*
         * The remembered-device door resolves consent like every other one -
         * design, 23 Sep: a child in the same state meets the same screen
         * whichever door they use. Inside the existing hold, so it is free.
         */
        const destination = await studentDestination(null);
        doneTimer.current = setTimeout(() => router.push(destination), DONE_MS);
      } catch (cause) {
        setDigits("");
        // 401/403 is the server's answer about these credentials. A 422 means
        // we sent a shape it rejects - the PIN length is the live example -
        // and anything else is the network or the server. Only the first is
        // about the child.
        setError(classifyLoginFailure(cause));
      } finally {
        setChecking(false);
      }
    },
    [router, signIn],
  );

  const addDigits = useCallback(
    (raw: string) => {
      if (done || checking || !chosen) return;
      const add = raw.replace(/[^0-9]/g, "");
      if (!add) return;
      setError(null);
      setDigits((prev) => {
        const next = (prev + add).slice(0, PIN_LENGTH);
        if (next.length === PIN_LENGTH) void submit(next, chosen);
        return next;
      });
    },
    [done, checking, chosen, submit],
  );

  const backspace = useCallback(() => {
    setError(null);
    setDigits((prev) => prev.slice(0, -1));
  }, []);

  // The client has not read the roster yet. The server cannot see localStorage,
  // so drawing anything here would flash it at whoever is holding the tablet.
  if (!entries) return null;

  if (!chosen) {
    return (
      <main className="min-h-dvh bg-nevo-cream">
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
          someoneElseHref="/auth/sign-in"
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
   */
  if (error === "paused") return <AccountOnPauseScreen />;

  const focusInput = () => inputRef.current?.focus();

  return (
    <main
      onClick={focusInput}
      className="flex min-h-[100dvh] cursor-text flex-col bg-nevo-cream"
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
        }}
        inputMode="none"
        aria-label="PIN"
        className="pointer-events-none absolute -left-[9999px] opacity-0"
      />

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-10 text-center">
        {/* Combined purple wordmark, cropped from the padded 1080-square file
            (frame: box 336x108 at the file's x392 y523). */}
        <span className="relative block h-[18px] w-[56px] overflow-hidden sm:h-5 sm:w-[62px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo-wordmark-purple.png"
            alt="Nevo"
            className="absolute block h-[180px] w-[180px] max-w-none -translate-x-[65px] -translate-y-[87px] sm:h-[200px] sm:w-[200px] sm:-translate-x-[73px] sm:-translate-y-[97px]"
          />
        </span>

        {!done && (
          /*
           * The child's shape, never their initials. 28c: avatars are "soft
           * geometric shapes, never a face", and initials on a screen anyone
           * in the room can see name a child to a stranger just as well as a
           * face does.
           */
          <ChildAvatar
            shapeIndex={chosen.shapeIndex}
            className="mt-9 size-[104px] sm:size-[120px]"
          />
        )}

        {done ? (
          <>
            <span className="mt-6 flex size-16 items-center justify-center rounded-full bg-nevo-navy motion-safe:animate-nevo-pop">
              <Check
                className="size-[34px] text-nevo-cream"
                strokeWidth={2.6}
              />
            </span>
            <h2 className="mt-5 text-[23px] leading-[1.3] font-medium tracking-[-0.01em] text-nevo-near-black sm:text-[26px]">
              {greeting(chosen.displayName)}
            </h2>
            <p className="mt-2.5 text-[15px] text-nevo-near-black/60">
              Taking you to your lessons…
            </p>
          </>
        ) : (
          <>
            <h2 className="mt-5 text-[23px] leading-[1.3] font-medium tracking-[-0.01em] text-nevo-near-black sm:text-[26px]">
              {greeting(chosen.displayName)}
            </h2>
            <p className="mt-2.5 text-[15px] text-nevo-near-black/60">
              Enter your PIN to keep going
            </p>
            <div className="mt-8 flex gap-3.5">
              {Array.from({ length: PIN_LENGTH }, (_, i) => {
                const active = i === digits.length && !checking;
                return (
                  <div
                    key={i}
                    className={cn(
                      "flex size-12 items-center justify-center rounded-[10px] border-[1.5px] bg-nevo-cream shadow-[0_2px_8px_rgba(0,0,0,0.05)]",
                      active
                        ? "border-nevo-navy"
                        : error
                          ? "border-nevo-violet"
                          : "border-nevo-near-black/20",
                    )}
                  >
                    {digits.length > i && (
                      <span className="block size-3 rounded-full bg-nevo-near-black" />
                    )}
                  </div>
                );
              })}
            </div>
            <p
              role="status"
              className="mt-[18px] min-h-5 max-w-[280px] text-sm leading-[1.4] text-nevo-violet"
            >
              {error === "credentials" &&
                "That PIN didn't match. Try again, or ask your teacher."}
              {error === "ours" &&
                "We couldn't check that just now - that's on us, not you. Try again in a moment."}
              {/* No frame covers this one; the copy is ours and deliberately
                  plain. What it must not do is what it used to: tell a child
                  who typed the right PIN too quickly that it was wrong. */}
              {error === "throttled" &&
                "That's a lot of tries in a row. Wait a moment, then try again."}
            </p>
            {/*
              THE PAD SITS IN THE SCREEN, under the boxes it fills, exactly
              where 28c-3 draws it.

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
              className="mt-7"
            />

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                router.push("/auth/forgot-pin");
              }}
              className="mt-2 h-11 cursor-pointer px-4 text-[15px] font-medium text-nevo-navy"
            >
              Forgot PIN?
            </button>
            {/*
              28c-3's "Not you? Go back" - and it now goes BACK TO THE PICKER
              rather than out to the full sign-in, which is what this button
              used to do as "Using a different device?".

              The difference matters on the screen this replaces. A child who
              tapped the wrong face wants the other five faces, not a school
              code and a username they may not know by heart. The route out to
              a full sign-in still exists, one step further on, as the picker's
              "Someone else".
            */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setChosen(null);
                setDigits("");
                setError(null);
              }}
              className="h-11 cursor-pointer px-4 text-[15px] font-medium text-nevo-near-black/70"
            >
              Not you? Go back
            </button>
          </>
        )}
      </div>

    </main>
  );
}
