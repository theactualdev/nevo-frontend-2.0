"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Button,
  IllustrationWrapper,
  Input,
  NevoKeyboard,
  useNevoKeyboardDock,
} from "@/components/shared";
import {
  getOnboardingDraft,
  mergeOnboardingDraft,
  type OnboardingDraft,
} from "@/lib/auth/onboarding";
import { OnboardingShell } from "./OnboardingShell";
import { AgeStepper, ageDigits, isAgeInRange } from "./AgeStepper";

const SCHOOL_STEP = "/student/onboarding/school";
const SEQUENCE_STEP = "/student/onboarding/sequence";

/**
 * Where this child goes after telling us their name.
 *
 * THIS USED TO BE THE SCHOOL STEP FOR EVERYONE, and that was the second half of
 * the same wall. A child who arrived through an invite link or a teacher's
 * class code already has their class - and no school code to type. They were
 * funnelled into a screen asking for one anyway, and the class step after it
 * would then have offered them a list of invented class names, because that
 * list appears whenever `draft.schoolCode` is unset.
 *
 * Both of those children are already connected by the time they get here:
 * `WelcomeScreen` stores a join token, `TeacherJoin` stores the class it
 * resolved. `ObservedInteractionSequence` knows how to redeem either. So the
 * steps in between have nothing left to ask, and skipping them is not a
 * shortcut - it is refusing to ask a question we already have the answer to.
 */
export function nextStepAfterName(draft: OnboardingDraft): string {
  if (draft.joinToken) return SEQUENCE_STEP;
  if (draft.classCode || (draft.classId && draft.schoolCode)) {
    return SEQUENCE_STEP;
  }
  return SCHOOL_STEP;
}

/**
 * Onboarding Step 1 — Name & Age (UI/UX spec B.2 Step 1). Captures the minimum
 * identity to create the account. Continue stays muted until both fields are
 * valid. Conversational headings, no clinical form labels.
 */
export function NameAndAgeStep() {
  const router = useRouter();
  /*
   * SEEDED FROM THE DRAFT, because a child can arrive here having already
   * answered this. The empty-roster dead end on the class step routes back to
   * Teacher Join, which resumes at this screen - so a child who typed their
   * name two screens ago was asked for it again, with the box blank, as though
   * nothing they had done had counted.
   *
   * A lazy initialiser rather than an effect: `sessionStorage` is invisible to
   * the server, and this is a client component reached only by navigation, so
   * there is no server render to disagree with. An effect would blank the field
   * for a frame and fight anything already typed.
   */
  const [name, setName] = useState(() => getOnboardingDraft().name ?? "");
  const [ageText, setAgeText] = useState(() => {
    const age = getOnboardingDraft().age;
    return age == null ? "" : String(age);
  });
  // A.12: the Nevo Keyboard opens while either field is focused (touch); a
  // hardware keyboard still types on desktop, where the on-screen one is hidden.
  const kb = useNevoKeyboardDock();
  /*
   * ONE DOCK, TWO FIELDS, as the frame draws it: the keyboard stays up when a
   * child moves from their name to their age, and its keys go to whichever
   * field they last touched.
   */
  const [field, setField] = useState<"name" | "age">("name");
  const focus = (next: "name" | "age") => () => {
    setField(next);
    kb.onFocus();
  };
  const typeKey = (c: string) =>
    field === "age"
      ? setAgeText((t) => ageDigits(t + c))
      : setName((n) => n + c);
  const deleteKey = () =>
    field === "age"
      ? setAgeText((t) => t.slice(0, -1))
      : setName((n) => n.slice(0, -1));

  const valid = name.trim().length > 0 && isAgeInRange(ageText);

  const submit = () => {
    if (!valid) return;
    // The draft folds into the device's remembered profile at PIN creation.
    mergeOnboardingDraft({ name: name.trim(), age: Number(ageText) });
    router.push(nextStepAfterName(getOnboardingDraft()));
  };

  return (
    <OnboardingShell step={1} backHref="/student/onboarding">
      <div className="flex justify-center">
        <IllustrationWrapper
          src="/illustrations/onboarding-name.png"
          alt="A friendly figure waving hello"
          width={500}
          height={611}
          priority
          className="mt-1 w-[104px] sm:mt-6 sm:w-[138px] lg:mt-4 lg:w-40"
        />
      </div>

      <h2 className="mt-5 text-[23px] font-medium leading-[1.25] tracking-[-0.01em] text-nevo-near-black sm:mt-8 sm:text-[26px] lg:mt-7">
        What should we call you?
      </h2>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onFocus={focus("name")}
          onBlur={kb.onBlur}
          inputMode="none"
          placeholder="Your name"
          autoComplete="off"
          aria-label="Your name"
          className="mt-6"
        />

        <p className="mt-8 text-[17px] font-medium text-nevo-near-black sm:text-lg">
          How old are you?
        </p>

        <div className="mt-4">
          <AgeStepper
            value={ageText}
            onChange={setAgeText}
            onFocus={focus("age")}
            onBlur={kb.onBlur}
          />
        </div>

        <Button type="submit" disabled={!valid} className="mt-8 w-full">
          Continue
        </Button>
      </form>

      {kb.open && (
        <NevoKeyboard
          layout="qwerty"
          onKey={typeKey}
          onBackspace={deleteKey}
          onReturn={submit}
          className="fixed inset-x-0 bottom-0 z-40"
        />
      )}
    </OnboardingShell>
  );
}
