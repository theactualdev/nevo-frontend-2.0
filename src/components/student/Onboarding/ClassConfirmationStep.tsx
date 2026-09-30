"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  IllustrationWrapper,
  NevoKeyboard,
  useNevoKeyboardDock,
} from "@/components/shared";
import {
  getOnboardingDraft,
  mergeOnboardingDraft,
  type OnboardingDraft,
} from "@/lib/auth/onboarding";
import { OnboardingShell } from "./OnboardingShell";

const NEXT_STEP = "/student/onboarding/sequence";
/** The other way into a class when the school roster cannot supply one. */
const CLASS_CODE_STEP = "/student/onboarding/teacher-join?mode=code";


/**
 * Onboarding Step 3 — Class Confirmation (UI/UX spec B.2 Step 3). One class →
 * auto-skip (brief confirming toast, then advance). Several → a searchable list;
 * tapping a class highlights it and advances. Class names come from the school
 * roster verbatim (no Nevo-imposed naming).
 */
/**
 * A class the child can be offered.
 *
 * `id` stays optional because the roster's own shape allows it, but every
 * option now comes from a verified roster - the demo list that was the only
 * other source is gone. An option without an id still cannot be joined, which
 * is what `pick` records honestly rather than looking one up by name.
 */
type ClassOption = { id?: string; name: string };

export function ClassConfirmationStep() {
  const router = useRouter();
  // sessionStorage is invisible to the server, so NOTHING about which classes
  // exist is decided until the client has actually read the draft. Null means
  // "not read yet" and is deliberately distinct from "read, and empty".
  const [draft, setDraft] = useState<OnboardingDraft | null>(null);
  useEffect(() => {
    // Post-mount hydration read of an external store, same pattern as
    // AccessibilityContext - it cannot run during render without a mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(getOnboardingDraft());
  }, []);

  /*
   * A verified school code is the only thing that makes the roster
   * authoritative - and the only thing that makes an EMPTY roster meaningful.
   *
   * THERE IS NO LIST TO FALL BACK TO, as of 18 Sep. This used to render
   * fourteen invented class names - "Year 2 Wrens", "Year 5 Otters" - whenever
   * `verified` was false. Rule 5: there was no roster, so we made one up.
   *
   * It was never only the signed-out walkthrough. `getOnboardingDraft` returns
   * `{}` both when no school was verified AND when the sessionStorage write
   * silently failed, which `mergeOnboardingDraft` swallows on purpose ("private
   * mode etc."). So a child who typed their real school code in a private or
   * storage-blocked browser arrived here, saw fourteen classes from a school
   * that is not theirs, and `pick` wrote `classId: undefined` - the exact
   * failure the docblock on `pick` says was fixed. That fix keyed on
   * `schoolCode`; the storage-failure path has no `schoolCode` to key on.
   *
   * Product's framing, and it is the sharper one: this is among the first
   * screens a school sees, and invented classes at that moment say the system
   * does not know their school.
   */
  const verified = Boolean(draft?.schoolCode);
  // Memoised because `filtered` below depends on it, and `draft?.classes ?? []`
  // is a fresh array on every render.
  const classes: ClassOption[] = useMemo(
    () => (verified ? (draft?.classes ?? []) : []),
    [verified, draft],
  );

  const mode = !draft
    ? "waiting"
    : !verified
      ? "unknown-school"
      : classes.length === 0
        ? "none"
        : classes.length === 1
          ? "autoskip"
          : "select";
  const [query, setQuery] = useState("");
  const kb = useNevoKeyboardDock();
  const [selected, setSelected] = useState<string | null>(null);
  const navT = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (navT.current) clearTimeout(navT.current);
    },
    [],
  );

  /*
   * Auto-skip: show the confirmation briefly, then advance.
   *
   * RECORD THE CLASS FIRST. This branch only navigated, and `pick` was the one
   * writer of `classId` - so a school with exactly ONE class told the child
   * "You're in <class>", moved on, and left the draft with no class in it at
   * all. Account creation ends at `connectClassCode`, which needs `classCode`
   * or `classId` + `schoolCode`; with neither it answers 422 "classCode or
   * classId with schoolCode is required", and the child is told their PIN did
   * not save at the very last screen of onboarding.
   *
   * A single-class school is not an edge case here - it is most small schools,
   * and it is the shape of every test tenant.
   */
  const only = classes.length === 1 ? classes[0] : null;
  useEffect(() => {
    if (mode !== "autoskip" || !only) return;
    mergeOnboardingDraft({ className: only.name, classId: only.id });
    const t = setTimeout(() => router.push(NEXT_STEP), 1400);
    return () => clearTimeout(t);
  }, [mode, only, router]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q === ""
      ? classes
      : classes.filter((c) => c.name.toLowerCase().includes(q));
  }, [classes, query]);

  const pick = (option: ClassOption) => {
    setSelected(option.name);
    // The id rides the draft to the step that finally joins the class. It comes
    // off the option the child actually tapped rather than being looked up by
    // NAME afterwards - a name is not a key, and the lookup silently returned
    // undefined for anything that was not on the verified roster.
    mergeOnboardingDraft({ className: option.name, classId: option.id });
    if (navT.current) clearTimeout(navT.current);
    navT.current = setTimeout(() => router.push(NEXT_STEP), 480);
  };

  // The draft has not been read yet. The server cannot see sessionStorage, so
  // this is also what the server renders - and drawing the demo list here
  // would flash fourteen invented class names at a real child for a frame.
  if (mode === "waiting") {
    return (
      <OnboardingShell step={3} backHref="/student/onboarding/school" fill>
        <div className="flex flex-1 items-center justify-center" />
      </OnboardingShell>
    );
  }

  /*
   * We never verified a school, so we know nothing about their classes.
   *
   * SEPARATE FROM `none` ON PURPOSE, though it wears the same layout. That
   * screen says "<school> is connected, but it hasn't added any classes",
   * which is true only when a school code was verified. Pointing this path at
   * that copy would have replaced fourteen invented classes with one invented
   * connection - a smaller lie, still a lie, and to the same child.
   *
   * The class code is the honest way forward rather than sending them back to
   * the school step: in the storage-blocked case the school step cannot record
   * an answer either, so back is a loop. `teacher-join` is the route that needs
   * no roster.
   */
  if (mode === "unknown-school") {
    return (
      <OnboardingShell step={3} backHref="/student/onboarding/school">
        <div className="flex shrink-0 justify-center">
          <IllustrationWrapper
            src="/illustrations/onboarding-class.png"
            alt="Three friendly classmates standing together"
            width={941}
            height={912}
            priority
            className="mt-2 w-[92px] sm:w-[120px] lg:w-[138px]"
          />
        </div>

        <h2 className="mt-[18px] shrink-0 text-[23px] font-medium leading-[1.25] tracking-[-0.01em] text-nevo-near-black sm:mt-6 sm:text-[26px]">
          Let&apos;s find your class
        </h2>

        <p className="mt-3 shrink-0 text-[15px] leading-[1.5] text-nevo-near-black/70">
          We don&apos;t have your school yet, so we can&apos;t show your classes.
          Ask your teacher for a class code and you can join that way.
        </p>

        <button
          type="button"
          onClick={() => router.push(CLASS_CODE_STEP)}
          className="mt-5 flex h-[52px] w-full shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-nevo-navy text-base font-medium text-nevo-cream transition-[opacity,filter] hover:brightness-106 active:scale-[0.99]"
        >
          Enter a class code
        </button>
      </OnboardingShell>
    );
  }

  // The school verified and its roster is empty. Say so, and give the child the
  // other way in rather than a list of classes that do not exist: a class code
  // from their teacher joins them directly, without needing the school roster.
  if (mode === "none") {
    return (
      <OnboardingShell step={3} backHref="/student/onboarding/school">
        <div className="flex shrink-0 justify-center">
          <IllustrationWrapper
            src="/illustrations/onboarding-class.png"
            alt="Three friendly classmates standing together"
            width={941}
            height={912}
            priority
            className="mt-2 w-[92px] sm:w-[120px] lg:w-[138px]"
          />
        </div>

        <h2 className="mt-[18px] shrink-0 text-[23px] font-medium leading-[1.25] tracking-[-0.01em] text-nevo-near-black sm:mt-6 sm:text-[26px]">
          We can&apos;t see any classes yet
        </h2>

        <p className="mt-3 shrink-0 text-[15px] leading-[1.5] text-nevo-near-black/70">
          {draft?.schoolName ?? "Your school"} is connected, but it hasn&apos;t
          added any classes for you to choose from. Ask your teacher for a class
          code and you can join that way.
        </p>

        <button
          type="button"
          onClick={() => router.push(CLASS_CODE_STEP)}
          className="mt-5 flex h-[52px] w-full shrink-0 cursor-pointer items-center justify-center rounded-[10px] bg-nevo-navy text-base font-medium text-nevo-cream transition-[opacity,filter] hover:brightness-106 active:scale-[0.99]"
        >
          Enter a class code
        </button>
      </OnboardingShell>
    );
  }

  if (mode === "autoskip") {
    return (
      <OnboardingShell step={3} backHref="/student/onboarding/school" fill>
        <div className="fixed top-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2.5 rounded-full bg-nevo-cream py-2 pr-5 pl-2 shadow-elevation-2 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 sm:top-7">
          <span className="flex size-[26px] items-center justify-center rounded-full bg-nevo-navy sm:size-[30px]">
            <Check
              className="size-[15px] text-nevo-cream sm:size-[17px]"
              strokeWidth={2.6}
            />
          </span>
          <span className="text-[15px] font-medium whitespace-nowrap text-nevo-near-black sm:text-[17px]">
            You&apos;re in {classes[0]?.name}
          </span>
        </div>

        <div className="flex flex-1 items-center justify-center">
          <IllustrationWrapper
            src="/illustrations/onboarding-class.png"
            alt="Three friendly classmates standing together"
            width={941}
            height={912}
            priority
            className="w-[92px] sm:w-[120px] lg:w-[138px]"
          />
        </div>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell step={3} backHref="/student/onboarding/school" fill>
      <div className="flex shrink-0 justify-center">
        <IllustrationWrapper
          src="/illustrations/onboarding-class.png"
          alt="Three friendly classmates standing together"
          width={941}
          height={912}
          priority
          className="mt-2 w-[92px] sm:w-[120px] lg:w-[138px]"
        />
      </div>

      <h2 className="mt-[18px] shrink-0 text-[23px] font-medium leading-[1.25] tracking-[-0.01em] text-nevo-near-black sm:mt-6 sm:text-[26px] lg:mt-[18px]">
        Which class are you in?
      </h2>

      <div className="mt-4 flex h-13 shrink-0 items-center gap-2.5 rounded-[10px] border-[1.5px] border-nevo-near-black/[0.16] bg-nevo-cream px-4 shadow-elevation-1">
        <Search
          className="size-5 shrink-0 text-nevo-near-black/45"
          strokeWidth={2}
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={kb.onFocus}
          onBlur={kb.onBlur}
          // A.12: Nevo Keyboard on touch; hardware keyboard on desktop.
          inputMode="none"
          placeholder="Search for your class"
          autoComplete="off"
          aria-label="Search for your class"
          className="h-full min-w-0 flex-1 bg-transparent text-base text-nevo-near-black outline-none placeholder:text-nevo-near-black/40"
        />
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
        {filtered.map((option) => (
          <button
            key={option.id ?? option.name}
            type="button"
            onClick={() => pick(option)}
            className={cn(
              "flex h-15 shrink-0 items-center justify-between rounded-[12px] border-[1.5px] bg-nevo-cream-elevated px-[18px] text-left shadow-elevation-1 transition hover:brightness-[0.97] active:brightness-[0.94] sm:h-16",
              selected === option.name
                ? "border-nevo-navy"
                : "border-transparent",
            )}
          >
            <span className="text-base font-medium text-nevo-near-black sm:text-[17px]">
              {option.name}
            </span>
            <ChevronRight
              className="size-5 shrink-0 text-nevo-navy"
              strokeWidth={2}
            />
          </button>
        ))}

        {filtered.length === 0 && (
          <p className="mt-2 px-1 text-sm leading-[1.5] text-nevo-near-black/55">
            No classes match that. Check the spelling, or ask your teacher for
            the exact name.
          </p>
        )}
      </div>

      {kb.open && (
        <NevoKeyboard
          layout="qwerty"
          onKey={(c) => setQuery((q) => q + c)}
          onBackspace={() => setQuery((q) => q.slice(0, -1))}
          onReturn={kb.close}
          className="fixed inset-x-0 bottom-0 z-40"
        />
      )}
    </OnboardingShell>
  );
}
