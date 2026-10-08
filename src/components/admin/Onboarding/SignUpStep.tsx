"use client";

import Link from "next/link";
import { useState } from "react";
import { authApi } from "@/lib/api/auth";
import { schoolApi, type SchoolRegistration } from "@/lib/api/school";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { Spinner } from "../Roster/primitives";
import {
  FIELD,
  FIELD_HELP,
  FIELD_LABEL,
  FieldNote,
  StepHeading,
  WIZARD_PRIMARY,
  type WizardState,
} from "./OnboardingWizard";

/**
 * D1.1 School sign-up - first contact.
 *
 * A proprietor arrives from a sales conversation and needs to feel this is a
 * serious system, in under a minute of typing.
 *
 * Validation rules that are easy to get wrong and are set by SCRUM-39:
 *   - the primary stays disabled until EVERY required field is valid
 *   - no inline nagging while a field is still focused; corrections appear on
 *     BLUR only
 *   - corrections are navy, never red, with no icon, and they say what is
 *     needed rather than what was wrong
 *   - while submitting, fields go READ-ONLY rather than visually disabled
 *
 * A duplicate email is not a dead end: it offers a way to sign in.
 *
 * The sign-in method is not asked here or anywhere in onboarding: it is
 * deferred with SSO. Why the server's `authMethod` cannot simply be written
 * to - a missing write AND a vocabulary mismatch - is in `AuthMethodStep`.
 *
 * TWO ROUND TRIPS, AND THEY FAIL DIFFERENTLY. `POST /schools/register` answers
 * `{schoolId, adminId, schoolCode}` and NO session, so the wizard signs in
 * immediately afterwards to get one - the later steps need a session to write
 * to `PATCH /api/v1/school`.
 *
 * Both used to sit in one promise chain under one `.catch`, which made the
 * second failure lie about the first. Register succeeds, the login round trip
 * times out, and the proprietor reads "nothing has been created yet" - while
 * their school and their own admin account both exist. They press Continue
 * again, register a second time, and get "this email is already set up with a
 * school", which reads as their mistake.
 *
 * So the two are separated, and once the school EXISTS this step will not
 * register again at any price: the fields lock and the only action left is to
 * retry the sign-in.
 *
 * TODO(api): a session on the register response would remove the second round
 * trip and this whole class of half-done state with it.
 */

type Phase =
  | "idle"
  /** Creating the school. Nothing exists yet. */
  | "registering"
  /** The school EXISTS; we are getting a session for it. */
  | "signingIn"
  | "duplicate"
  /** Registration itself failed - nothing was created. */
  | "failed"
  /** Registered, but not signed in. The difference is the whole point. */
  | "signInFailed";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 10;

export function SignUpStep({
  state,
  onChange,
  onDone,
}: {
  state: WizardState;
  onChange: (patch: Partial<WizardState>) => void;
  onDone: () => void;
}) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [phase, setPhase] = useState<Phase>("idle");
  /*
   * Set the moment the school exists. Nothing may register again after this -
   * a second attempt with an edited email would create a SECOND school.
   *
   * IT LIVES ON THE WIZARD, not here: this step unmounts as soon as the wizard
   * moves on, and step 1's Back button remounts it. As local state the guard
   * lasted one mount, and one press of Back unlocked the fields again.
   */
  const registered = state.registration;
  const setRegistered = (r: SchoolRegistration) => onChange({ registration: r });

  const busy = phase === "registering" || phase === "signingIn";
  const submitting = busy;
  const blur = (k: string) => setTouched((t) => ({ ...t, [k]: true }));

  const emailValid = EMAIL.test(state.email.trim());
  const passwordValid = password.length >= MIN_PASSWORD;
  const confirmValid = confirm.length > 0 && confirm === password;
  const valid =
    state.schoolName.trim().length > 0 &&
    state.adminName.trim().length > 0 &&
    emailValid &&
    passwordValid &&
    confirmValid;

  /*
   * D01'S LOCATION, WRITTEN ONCE THERE IS A SESSION TO WRITE WITH. Register
   * takes no location, and `PATCH /api/v1/school` needs a bearer, so it goes
   * to the school's contact - where Settings reads and edits it - straight
   * after sign-in.
   *
   * Never a reason to hold the proprietor on this step: the school and their
   * account exist, and a location is one field in Settings. The step moves on
   * whatever happens, and the handover says so if it did not land.
   */
  const saveLocation = () => {
    const place = state.location.trim();
    if (!place) return Promise.resolve();
    return schoolApi.saveContact({ location: place }).then(
      () => undefined,
      () => undefined,
    );
  };

  /** The second round trip, on its own, so its failure describes itself. */
  const signIn = () => {
    setPhase("signingIn");
    authApi
      .loginPassword({ email: state.email.trim(), password })
      .then(
        () => saveLocation().then(onDone),
        () => setPhase("signInFailed"),
      );
  };

  const submit = () => {
    if (busy) return;
    /*
     * ONE ENTRY POINT, and the branch lives here rather than on the button's
     * `onClick`. Wiring the button to `signIn` instead would work equally well
     * today and be untestable: a mutation that deletes this line has to be
     * caught by a test that presses the same button twice, which is what a
     * proprietor actually does. Registering twice makes a SECOND school.
     */
    if (registered) {
      signIn();
      return;
    }
    if (!valid) return;
    setPhase("registering");
    schoolApi
      .register({
        schoolName: state.schoolName.trim(),
        adminName: state.adminName.trim(),
        email: state.email.trim(),
        password,
      })
      .then((created) => {
        setRegistered(created);
        signIn();
      })
      .catch((e: unknown) => {
        // Only REGISTRATION's failures are described here. A 409 is a duplicate
        // email; anything else genuinely created nothing.
        if (e instanceof ApiError && e.status === 409) {
          setPhase("duplicate");
          return;
        }
        setPhase("failed");
      });
  };

  return (
    <>
      <StepHeading
        title="Let's set up your school"
        sub="A few details to create your Nevo workspace. You can come back to anything except how everyone signs in."
      />

      <div className="mt-8 flex flex-col gap-5">
        <div>
          <label htmlFor="ob-school" className={FIELD_LABEL}>
            School name
          </label>
          <input
            id="ob-school"
            value={state.schoolName}
            readOnly={submitting || registered !== null}
            onChange={(e) => onChange({ schoolName: e.target.value })}
            onBlur={() => blur("school")}
            placeholder="Brightgate Academy"
            autoComplete="organization"
            className={FIELD}
          />
        </div>

        {/*
          * D01 draws "School type" beside this. It is not built: nothing in
          * the contract takes it and nothing in the product reads it, and a
          * question whose answer goes nowhere is worse than no question.
          * Location has a home - the school's contact, which Settings edits.
          *
          * Not locked once the school is registered, unlike the fields above:
          * it is not part of registration, and is only written after sign-in.
          */}
        <div>
          <label htmlFor="ob-location" className={FIELD_LABEL}>
            Location{" "}
            <span className="font-normal text-nevo-near-black/45">optional</span>
          </label>
          <input
            id="ob-location"
            value={state.location}
            readOnly={submitting}
            onChange={(e) => onChange({ location: e.target.value })}
            placeholder="Lagos, Nigeria"
            autoComplete="address-level2"
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="ob-name" className={FIELD_LABEL}>
            Your full name
          </label>
          <input
            id="ob-name"
            value={state.adminName}
            readOnly={submitting || registered !== null}
            onChange={(e) => onChange({ adminName: e.target.value })}
            onBlur={() => blur("name")}
            placeholder="Folake Adebayo"
            autoComplete="name"
            className={FIELD}
          />
        </div>

        <div>
          <label htmlFor="ob-email" className={FIELD_LABEL}>
            Work email address
          </label>
          <input
            id="ob-email"
            type="email"
            value={state.email}
            readOnly={submitting || registered !== null}
            onChange={(e) => {
              onChange({ email: e.target.value });
              if (phase === "duplicate") setPhase("idle");
            }}
            onBlur={() => blur("email")}
            placeholder="f.adebayo@brightgate.edu.ng"
            autoComplete="email"
            className={FIELD}
          />
          {touched.email && state.email.trim() && !emailValid ? (
            <FieldNote>This needs to be a full email address.</FieldNote>
          ) : null}
          {phase === "duplicate" ? (
            <FieldNote>
              This email is already set up with a school.{" "}
              <Link href="/auth/admin" className="underline underline-offset-2">
                Sign in instead
              </Link>
              , or use another address.
            </FieldNote>
          ) : null}
        </div>

        <div>
          <label htmlFor="ob-password" className={FIELD_LABEL}>
            Password
          </label>
          <input
            id="ob-password"
            type="password"
            value={password}
            readOnly={submitting || registered !== null}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => blur("password")}
            autoComplete="new-password"
            className={FIELD}
          />
          {touched.password && password && !passwordValid ? (
            <FieldNote>
              This needs to be at least {MIN_PASSWORD} characters.
            </FieldNote>
          ) : (
            <p className={FIELD_HELP}>
              At least {MIN_PASSWORD} characters. A phrase you&rsquo;ll remember
              is stronger than a short jumble.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="ob-confirm" className={FIELD_LABEL}>
            Confirm password
          </label>
          <input
            id="ob-confirm"
            type="password"
            value={confirm}
            readOnly={submitting || registered !== null}
            onChange={(e) => setConfirm(e.target.value)}
            onBlur={() => blur("confirm")}
            autoComplete="new-password"
            className={FIELD}
          />
          {touched.confirm && confirm && !confirmValid ? (
            <FieldNote>These two need to match.</FieldNote>
          ) : null}
        </div>
      </div>

      {phase === "failed" ? (
        <div className="mt-6 rounded-[10px] bg-nevo-violet/[0.18] px-4 py-3.5">
          <p className="m-0 text-[13.5px] leading-[1.55] text-nevo-navy">
            That didn&rsquo;t go through, and nothing has been created yet.
            We&rsquo;re on it - everything you typed is still here.
          </p>
        </div>
      ) : null}

      {phase === "signInFailed" ? (
        /*
         * The opposite of the panel above, and it used to BE that panel. The
         * school and the admin account are real; only the session is missing.
         * Telling them nothing was created sends them round again to a
         * duplicate-email error on a school they successfully made.
         */
        <div className="mt-6 rounded-[10px] bg-nevo-violet/[0.18] px-4 py-3.5">
          <p className="m-0 text-[13.5px] leading-[1.55] text-nevo-navy">
            <strong>{state.schoolName.trim()} is created</strong>, and so is your
            admin account &ndash; we just couldn&rsquo;t sign you in. Nothing
            needs creating again.
          </p>
          {registered?.schoolCode ? (
            <p className="m-0 mt-1.5 text-[13.5px] leading-[1.55] text-nevo-navy">
              Your school code is{" "}
              <span className="font-mono font-semibold">
                {registered.schoolCode}
              </span>
              .
            </p>
          ) : null}
          <p className="m-0 mt-1.5 text-[13.5px] leading-[1.55] text-nevo-navy">
            Try again below, or{" "}
            <Link href="/auth/admin" className="underline underline-offset-2">
              sign in directly
            </Link>
            .
          </p>
        </div>
      ) : null}

      <button
        type="button"
        onClick={submit}
        disabled={busy || (!registered && !valid)}
        className={cn(WIZARD_PRIMARY, "mt-8")}
      >
        {busy ? (
          <span className="inline-flex items-center justify-center gap-2.5">
            <Spinner />
            {phase === "signingIn"
              ? "Signing you in…"
              : "Creating your workspace…"}
          </span>
        ) : registered ? (
          "Try signing in"
        ) : (
          "Continue"
        )}
      </button>
    </>
  );
}
