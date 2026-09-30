"use client";

import { useState } from "react";
import type { EnrolmentBand, SchoolAuthMethod } from "@/lib/api/school";
import { cn } from "@/lib/utils";
import { ConfirmEmailStep } from "./ConfirmEmailStep";
import { DpaStep } from "./DpaStep";
import { HandoverStep } from "./HandoverStep";
import type { SchoolRegistration } from "@/lib/api/school";
import { SignUpStep } from "./SignUpStep";

/**
 * D1 School Onboarding (SCRUM-39) - the most consequential setup flow in the
 * product. Every downstream student and teacher screen depends on what happens
 * here.
 *
 * A calm single-column wizard with NO SIDEBAR: the workspace does not exist
 * until this completes, so there is nothing to navigate. There is also no
 * back-out to a marketing site - once a proprietor starts, the only way is
 * through or away.
 *
 * FIVE STEPS OR SIX? The D1 frame draws "Step 1 of 5"; SCRUM-39 says "Six
 * short steps" and specifies a row of six pills. The spec enumerates D1.1
 * through D1.5 as five distinct SCREENS, with 1.5 having two variants - so the
 * sixth pill is the workspace itself, arriving. Five steps are built, and the
 * indicator shows five. Raised with design; it is a one-line change either way.
 *
 * FAILURE IS A RECOVERY MOMENT throughout: no red, no alarm glyph, no blame.
 * The system owns the fault, the work so far is preserved AND SAID to be
 * preserved, and there is always a forward path plus a quiet secondary.
 *
 * Written for a proprietor, not an IT specialist.
 */

export type Step = 0 | 1 | 2 | 3;

export interface WizardState {
  schoolName: string;
  /**
   * D01's "Location". Not a registration field - `SchoolRegistrationRequest`
   * is `{schoolName, adminName, email, password}` - so it is held here and
   * written to the school's contact once the new admin is signed in.
   */
  location: string;
  adminName: string;
  email: string;
  authMethod: SchoolAuthMethod | null;
  band: EnrolmentBand | null;
  /**
   * The school, once it exists. LIVES HERE, not in `SignUpStep`, because the
   * step is unmounted the moment the wizard leaves step 0 - and step 1's Back
   * button brings it back with fresh state. Held locally, the never-register-
   * twice guard survived exactly one mount: one press of Back reset it to null,
   * unlocked the fields, and let a second school be created for a school that
   * already existed.
   */
  registration: SchoolRegistration | null;
}

/**
 * FOUR, AND DESIGN ANSWERED. Sign up · Confirm email · DPA read-gate ·
 * handover. Both of the steps that made this six are gone, each for its own
 * reason and neither on our own reading of a step rail:
 *
 *  - **The enrolment band is dead.** Flat pricing at ₦150,000 per student, and
 *    the cost lives on D24's dashboard panel rather than in onboarding. This
 *    file's own note had recorded the frame saying "no tiers, no plan to
 *    choose" long before anybody acted on it.
 *  - **The sign-in method is DEFERRED, not dead.** Every school is manual for
 *    now - school code, CSV upload, staff signing in with their own email and
 *    password - and nothing in the console asks about a provider. Backend's
 *    SSO work stays; see `AuthMethodStep`, which is kept on disk and off the
 *    flow.
 */
const TOTAL = 4;

export function OnboardingWizard() {
  const [step, setStep] = useState<Step>(0);
  const [state, setState] = useState<WizardState>({
    schoolName: "",
    location: "",
    adminName: "",
    email: "",
    authMethod: null,
    band: null,
    registration: null,
  });

  const patch = (p: Partial<WizardState>) => setState((s) => ({ ...s, ...p }));

  return (
    /*
     * `xl:`, NOT `lg:` - the console's own tablet boundary is 1280, where the
     * admin shell collapses its rail, and the frames are drawn at 1440 and
     * 1024. Keyed at `lg` this wizard applied its DESKTOP centring from
     * 1024 up, so the tablet treatment the frame draws at 1024x768 could
     * never be reached. Same re-key as the rest of the console.
     */
    <main className="flex min-h-dvh flex-col items-center bg-nevo-cream px-6 py-16 xl:justify-center xl:py-12">
      <div className="flex w-full max-w-[520px] flex-col">
        <span className="relative mb-9 block h-[24px] w-[81px] shrink-0 self-center overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo-wordmark-purple.png"
            alt="Nevo"
            className="absolute block h-[236px] w-[236px] max-w-none -translate-x-[85px] -translate-y-[113px]"
          />
        </span>
        {/* Position is the only signal - no numbers, no labels. */}
        <div className="mb-9 flex gap-2" aria-hidden="true">
          {Array.from({ length: TOTAL }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                i <= step ? "bg-nevo-navy" : "bg-nevo-navy/16",
              )}
            />
          ))}
        </div>
        <p className="sr-only" role="status">
          Step {step + 1} of {TOTAL}
        </p>

        {step === 0 ? (
          <SignUpStep
            state={state}
            onChange={patch}
            onDone={() => setStep(1)}
          />
        ) : null}

        {/*
          * BEFORE THE DPA, AND THAT IS THE POINT. D01: "Email confirm sits
          * before the DPA so acceptance is tied to a verified owner." The DPA
          * acceptance record names an administrator and is displayed on two
          * screens; without this step it could name an address nobody had
          * shown they owned.
          */}
        {step === 1 ? (
          <ConfirmEmailStep
            schoolName={state.schoolName}
            email={state.email}
            onDone={() => setStep(2)}
          />
        ) : null}

        {step === 2 ? (
          <DpaStep
            schoolName={state.schoolName}
            onBack={() => setStep(1)}
            onDone={() => setStep(3)}
          />
        ) : null}

        {step === 3 ? <HandoverStep state={state} /> : null}
      </div>
    </main>
  );
}

/* ------------------------------------------------------- shared step chrome */

export function StepHeading({
  title,
  sub,
}: {
  title: string;
  sub: string;
}) {
  return (
    <>
      <h1 className="m-0 text-[30px] font-semibold leading-[1.2] tracking-[-0.02em] text-nevo-near-black">
        {title}
      </h1>
      <p className="mt-2.5 text-[15px] leading-[1.6] text-nevo-near-black/62">{sub}</p>
    </>
  );
}

/** Full-width navy primary. Disabled is muted, never removed from the page. */
export const WIZARD_PRIMARY =
  "w-full cursor-pointer rounded-[10px] bg-nevo-navy px-5 py-[15px] text-[15.5px] font-semibold text-nevo-cream transition-[filter] hover:brightness-110 disabled:cursor-default disabled:bg-nevo-navy/28 disabled:text-nevo-cream/60 disabled:hover:brightness-100";

export const WIZARD_SECONDARY =
  "w-full cursor-pointer rounded-[10px] px-5 py-[15px] text-[15.5px] font-semibold text-nevo-near-black/70 transition-colors hover:bg-nevo-near-black/[0.05]";

export const FIELD_LABEL =
  "mb-2 block text-[13px] font-medium text-nevo-near-black/62";

export const FIELD =
  "w-full rounded-[10px] border border-nevo-near-black/12 bg-nevo-cream-elevated px-4 py-3.5 text-[15.5px] text-nevo-near-black outline-none transition-colors focus:border-nevo-navy";

export const FIELD_HELP = "mt-2 text-[12.5px] leading-[1.5] text-nevo-near-black/50";

/**
 * A field-level correction. On blur only, under the field, navy - no icon and
 * no red. The wording describes what is NEEDED, never what was wrong.
 */
export function FieldNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 text-[12.5px] leading-[1.5] text-nevo-navy">{children}</p>
  );
}
