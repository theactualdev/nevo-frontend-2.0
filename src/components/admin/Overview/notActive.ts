import type { OnboardingState } from "@/lib/api/onboarding";

/**
 * D24 OB-00 "the unfinished dashboard" – what a school that is not active yet
 * sees in place of the Overview. The pure half: which step is where, and which
 * of the frame's three moments the school is in.
 *
 * *"Not empty – inert. It is obvious the school is off and why. Nothing
 * uploaded is an invitation; staff-only is a half-finished job;
 * everything-uploaded is one question with one answer."*
 *
 * THE STAGE IS THE SERVER'S. Which of "still uploading" and "roster confirmed"
 * a school is in comes from `stage`, never from which counts happen to be
 * zero - backend's own note on the enum. The counts only say what a step's
 * sub-line reports ("18 teachers added"), which is what they are.
 */

export type StepState = "done" | "current" | "todo";

export interface SetupStep {
  n: number;
  label: string;
  sub: string;
  state: StepState;
  /** Only the current step carries an action, as the frame draws it. */
  action: string | null;
  href: string | null;
}

/** A: nothing uploaded. B: something uploaded, roster not confirmed. C: confirmed, to pay. */
export type Moment = "nothing_uploaded" | "part_uploaded" | "to_pay";

export function momentFor(state: OnboardingState): Moment {
  if (state.stage === "confirmed" || state.stage === "awaiting_payment") {
    return "to_pay";
  }
  return state.teacherCount > 0 || state.studentCount > 0
    ? "part_uploaded"
    : "nothing_uploaded";
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

function teachersSub(n: number): string {
  return `${plural(n, "teacher", "teachers")} added`;
}

function studentsSub(state: OnboardingState): string {
  const students = plural(state.studentCount, "student", "students");
  const classes = state.classes.length;
  return classes > 0
    ? `${students} across ${plural(classes, "class", "classes")}`
    : `${students} added`;
}

/**
 * The frame's four-step spine.
 *
 * WHILE UPLOADING, the two files go in "in any order" (OB-01), so the current
 * step is the first file not yet in, and confirming is current once both are.
 *
 * ONCE CONFIRMED, the first three are done and paying is the one question
 * left. A school that confirmed with no staff file has nothing to call "18
 * teachers added"; its first step says so rather than claiming a count.
 */
export function setupSteps(
  state: OnboardingState,
  /** "₦54,825,000 for 2026/27", formatted by the caller from server fields. */
  payLine: string | null,
): SetupStep[] {
  const pay = {
    n: 4,
    label: "Pay for the year",
    sub: "By bank transfer – your school switches on once it clears",
  };

  if (momentFor(state) === "to_pay") {
    return [
      {
        n: 1,
        label: "Upload your staff",
        sub:
          state.teacherCount > 0
            ? teachersSub(state.teacherCount)
            : "No staff file – you can invite teachers once you're active",
        state: "done",
        action: null,
        href: null,
      },
      {
        n: 2,
        label: "Upload your students",
        sub: studentsSub(state),
        state: "done",
        action: null,
        href: null,
      },
      {
        n: 3,
        label: "Confirm your roster",
        sub: "Confirmed",
        state: "done",
        action: null,
        href: null,
      },
      {
        ...pay,
        sub: payLine ?? pay.sub,
        state: "current",
        action: "Pay now",
        href: "/admin/activate",
      },
    ];
  }

  const staffIn = state.teacherCount > 0;
  const studentsIn = state.studentCount > 0;
  const current = !staffIn ? 1 : !studentsIn ? 2 : 3;
  const at = (n: number, done: boolean): StepState =>
    done ? "done" : n === current ? "current" : "todo";

  return [
    {
      n: 1,
      label: "Upload your staff",
      sub: staffIn
        ? teachersSub(state.teacherCount)
        : "A teacher file – names and the classes they hold",
      state: at(1, staffIn),
      action: current === 1 ? "Upload staff" : null,
      href: current === 1 ? "/admin/roster" : null,
    },
    {
      n: 2,
      label: "Upload your students",
      sub: studentsIn
        ? studentsSub(state)
        : "A student file – Nevo builds your classes from it",
      state: at(2, studentsIn),
      action: current === 2 ? "Upload students" : null,
      href: current === 2 ? "/admin/roster" : null,
    },
    {
      n: 3,
      label: "Confirm your roster",
      sub: "Check what Nevo derived before anything is created",
      state: at(3, false),
      action: current === 3 ? "Review and confirm" : null,
      href: current === 3 ? "/admin/roster" : null,
    },
    { ...pay, state: "todo", action: null, href: null },
  ];
}

/** The sentence under the heading - the frame's, per moment. */
export function leadFor(state: OnboardingState): string {
  switch (momentFor(state)) {
    case "nothing_uploaded":
      return "Nothing has been sent to anyone – no student, teacher or parent can see Nevo yet. Add your roster and pay, and your school switches on. Start whenever your files are to hand.";
    case "part_uploaded":
      if (state.teacherCount > 0 && state.studentCount === 0) {
        return "Your staff are in. Add your students next and your headcount and cost will settle here. Still nothing sent to anyone.";
      }
      if (state.studentCount > 0 && state.teacherCount === 0) {
        return "Your students are in. Add your staff next, then check what Nevo found. Still nothing sent to anyone.";
      }
      return "Your files are in. Check what Nevo found and confirm your roster. Still nothing sent to anyone.";
    case "to_pay":
      return "Your roster is confirmed. One step is left: pay for the year, and your school switches on for everyone.";
  }
}
