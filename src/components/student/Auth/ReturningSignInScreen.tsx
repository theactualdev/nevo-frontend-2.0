"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { NevoKeyboard } from "@/components/shared";
import {
  CodeInput,
  SCHOOL_CODE_MAX,
  SCHOOL_CODE_MIN,
  normaliseCode,
} from "@/components/student/Onboarding/CodeInput";
import { authApi } from "@/lib/api";
import { usersApi } from "@/lib/api/users";
import {
  classifyLoginFailure,
  type LoginFailure,
} from "@/lib/auth/loginFailure";
import { rememberProfile } from "@/lib/auth/session";
import { studentDestination } from "@/lib/auth/entryGate";
import { useAuth } from "@/hooks";
import { STUDENT_PIN_LENGTH, type UserRole } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { AccountOnPauseScreen } from "./AccountOnPauseScreen";

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
 * WHERE A CHILD GETS THEIR USERNAME is the part design did not answer. It is
 * server-issued at account creation and no student screen has ever shown one;
 * teachers see it on their class detail and admins on the student record. So
 * the line under the heading points at the person who can read it out, which is
 * the best this screen can do until someone rules otherwise.
 *
 * "DIDN'T MATCH" KEEPS THE FIELDS FILLED, per the frame - only the PIN clears.
 * Making a child retype a school code and a username they have just been read
 * out is how you lose them at the last step.
 */

/** The username is server-issued; we bound it only by what the contract takes. */
const USERNAME_MIN = 1;
const USERNAME_MAX = 50;

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

  const [schoolCode, setSchoolCode] = useState("");
  const [username, setUsername] = useState("");
  const [digits, setDigits] = useState("");
  const [done, setDone] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<LoginFailure | null>(null);
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
      setDigits((d) => (d + add).slice(0, STUDENT_PIN_LENGTH));
    },
    [],
  );

  const identifier = username.trim();
  const school = schoolCode.trim();
  const ready =
    school.length >= SCHOOL_CODE_MIN &&
    identifier.length >= USERNAME_MIN &&
    digits.length === STUDENT_PIN_LENGTH;

  const submit = useCallback(async () => {
    if (!ready || checking) return;
    setChecking(true);
    setError(null);
    try {
      const session = await authApi.loginPin({
        schoolCode: school,
        loginIdentifier: identifier,
        pin: digits,
      });
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
      });
      signIn({
        id: session.userId,
        // `name` is optional on AuthUser, and absent beats the username.
        role: session.role as UserRole,
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
          const first =
            (me.firstName ?? me.displayName ?? "").trim().split(/\s+/)[0] || "";
          if (!first) return;
          rememberProfile({
            schoolCode: school,
            loginIdentifier: identifier,
            displayName: first,
            initials: first.slice(0, 2).toUpperCase(),
          });
        })
        .catch(() => {
          // Not knowing their name is not a reason to undo a sign-in they have
          // already passed. The device remembers them namelessly instead, and
          // "Welcome back" alone is a better greeting than their username.
        });
      setDone(true);
      /*
       * Consent is resolved before the child lands anywhere - design, 23 Sep:
       * the gate is on the child's state, not on the door they used, and PIN
       * sign-in is an entry path. The read happens INSIDE the "Welcome back"
       * hold that already exists, so it costs a held child nothing and costs
       * everybody else nothing either.
       */
      const destination = await studentDestination(next);
      doneTimer.current = setTimeout(() => router.push(destination), DONE_MS);
    } catch (cause) {
      // Only the PIN clears. The other two fields stay, deliberately.
      setDigits("");
      setError(classifyLoginFailure(cause));
    } finally {
      setChecking(false);
    }
  }, [ready, checking, school, identifier, digits, signIn, router, next]);

  /*
   * A paused account takes the whole screen, exactly as it does at the PIN
   * unlock. There is nothing here a child can do, and leaving the form
   * underneath would invite them to keep trying something that cannot work.
   */
  if (error === "paused") return <AccountOnPauseScreen />;

  if (done) {
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-nevo-cream px-10 text-center text-nevo-near-black">
        <span className="flex size-16 items-center justify-center rounded-full bg-nevo-navy motion-safe:animate-nevo-pop">
          <Check className="size-[34px] text-nevo-cream" strokeWidth={2.6} />
        </span>
        <h2 className="mt-5 text-[23px] leading-[1.3] font-medium tracking-[-0.01em] sm:text-[26px]">
          Welcome back, {identifier}
        </h2>
        <p className="mt-2.5 text-[15px] text-nevo-near-black/60">
          Taking you to your lessons…
        </p>
      </main>
    );
  }

  return (
    <main className="flex min-h-[100dvh] flex-col items-center bg-nevo-cream px-8 pt-14 pb-8 text-nevo-near-black">
      <div className="flex w-full max-w-[420px] flex-1 flex-col">
        <h1 className="text-[22px] leading-[1.3] font-semibold tracking-[-0.01em] text-balance sm:text-2xl">
          Sign back in
        </h1>
        <p className="mt-2.5 text-[15px] leading-[1.55] text-nevo-near-black/70">
          This device doesn&apos;t know you yet. Your teacher can tell you your
          school code and username.
        </p>

        <div className="mt-7 flex flex-col gap-5">
          <div>
            {/*
              A VISIBLE label, not just `CodeInput`'s `label` prop - that one is
              an `aria-label` and shows a sighted child nothing. Elsewhere in
              onboarding a code field stands alone and the heading above says
              what it is; here there are three fields in a row, and a child
              being read a code and a username by their teacher has to know
              which box takes which.
            */}
            <p className="text-[13px] font-medium tracking-[0.02em] text-nevo-near-black/60 uppercase">
              School code
            </p>
            <div className="mt-3">
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
            and destroys a username. `amara.k` arrives as `AMARAK`, which the
            server has never heard of, so NO CHILD COULD EVER SIGN IN. The
            identifier is issued by the server and has to be sent back exactly
            as it was given.

            Same underline-line treatment as the field above, per the frame.
          */}
          <div>
            <label
              htmlFor="returning-username"
              className="text-[13px] font-medium tracking-[0.02em] text-nevo-near-black/60 uppercase"
            >
              Username
            </label>
            <div
              className={cn(
                "relative mt-3 flex h-15 w-full items-center rounded-[10px] border-[1.5px] bg-nevo-cream px-4 shadow-elevation-1 transition-colors sm:h-17",
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
                placeholder="Ask your teacher"
                className="w-full bg-transparent text-[17px] text-nevo-near-black outline-none placeholder:text-nevo-near-black/35"
              />
            </div>
          </div>

          <div>
            <p
              id="returning-pin-label"
              className="text-[13px] font-medium tracking-[0.02em] text-nevo-near-black/60 uppercase"
            >
              PIN
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
              Nevo pad is the designed way in and is visible.
            */}
            <div className="relative mt-3">
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
                inputMode="none"
                autoComplete="off"
                aria-labelledby="returning-pin-label"
                className="absolute inset-0 z-10 h-full w-full cursor-text rounded-[10px] bg-transparent opacity-0 outline-none"
              />
              <div
                className="flex gap-3.5"
                role="group"
                aria-labelledby="returning-pin-label"
              >
              {Array.from({ length: STUDENT_PIN_LENGTH }, (_, i) => {
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
            </div>
          </div>
        </div>

        <p
          role="status"
          className="mt-4 min-h-10 text-sm leading-[1.4] text-nevo-violet"
        >
          {error === "credentials" &&
            "That didn't match. Check the code and username with your teacher, then try your PIN again."}
          {error === "throttled" &&
            "That's a lot of tries in a row. Wait a moment, then try again."}
          {error === "ours" &&
            "We couldn't check that just now - that's on us, not you. Try again in a moment."}
        </p>

        <button
          type="button"
          disabled={!ready || checking}
          onClick={() => void submit()}
          className={cn(
            "h-[52px] w-full rounded-[10px] bg-nevo-navy text-base font-semibold text-nevo-cream",
            ready && !checking
              ? "cursor-pointer transition-[filter,transform] hover:brightness-109 active:scale-[0.985]"
              : "cursor-not-allowed opacity-40",
          )}
        >
          Sign in
        </button>

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
          className="mt-3 h-11 cursor-pointer text-[15px] font-medium text-nevo-navy"
        >
          I&apos;m new to Nevo
        </button>

        <NevoKeyboard
          layout="pad"
          presentation="block"
          className="mt-6"
          onKey={(char) => {
            if (checking) return;
            addDigits(char);
          }}
          onBackspace={() => setDigits((d) => d.slice(0, -1))}
          onReturn={() => void submit()}
        />
      </div>
    </main>
  );
}
