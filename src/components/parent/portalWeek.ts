import type { ChildSubjectProgress, SubjectProgress } from "@/lib/api/parent";

/**
 * D02's portal home, as words: which of its states this week is, and what each
 * card says. Pure, so every state is testable without a render.
 *
 * WHICH STATE IS THE SERVER'S CALL, MOSTLY. `window.state` says whether school
 * was on (`in_term`), on break (`in_break`) or whether the school never set
 * its terms (`terms_not_set`) - backend's words: "An empty week means three
 * different things... Deciding which is ours." What is left here is reading
 * the subjects the server sent: all of them not started (B6), none with
 * anything in them (B2, or B7 on a Monday with nothing yet).
 *
 * WHAT IS LEFT OFF, against the frame:
 * - THE FOOT LINE ("5 topics mastered so far, up from 4 last week"). The "5"
 *   is `masteredBeforeWindow` plus the names in `masteredThisWindow` - a sum
 *   the client would be doing, on a figure about a named child. Asked of
 *   backend as a field instead. The names mastered this week are on the card.
 * - "Last lesson Thu 14 Jan" (B2's foot): no field carries a last lesson.
 * - B4's "Since setup". The contract's window is a Monday-to-Sunday week for
 *   `terms_not_set` too, so "since setup" would describe a period the numbers
 *   do not cover. That week renders as a week, with no quiet-week or break
 *   panel - the one claim B4 exists to avoid.
 * - The class in the eyebrow ("· JSS 2A") and the parent's initials: no
 *   parent read carries either.
 * - Pronouns. The frame's copy says "she" and "her"; nothing sends a
 *   pronoun, so the child is named instead.
 */

export type WeekKind =
  /** B1, B5, and any week with something in it. */
  | "week"
  /** B2: school was on and nothing has come through. */
  | "quiet"
  /** B3: a break. Never "quiet". */
  | "break"
  /** B6: every subject set up and none started. */
  | "first"
  /** B7: Monday, nothing yet. The dated label carries it. */
  | "monday"
  /** No subjects at all. Not drawn; the nothing-state, said plainly. */
  | "none";

const hasWork = (s: SubjectProgress) =>
  s.covered.length > 0 || s.masteredThisWindow.length > 0;

export function weekKind(p: ChildSubjectProgress, today: string): WeekKind {
  const subjects = p.subjects;
  if (subjects.length === 0) return "none";
  if (subjects.every((s) => s.state === "not_started")) return "first";
  if (p.window.state === "in_break") return "break";
  if (subjects.some(hasWork)) return "week";
  if (p.window.inProgress && p.window.startsOn === today) return "monday";
  // `terms_not_set` cannot claim a quiet week any more than a break.
  return p.window.state === "in_term" ? "quiet" : "week";
}

/** "Mon 18", from a bare date read where it was written - never shifted by UTC. */
export function dayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  const weekday = date.toLocaleDateString("en-GB", { weekday: "short" });
  return `${weekday} ${date.getDate()}`;
}

/** The card's dated label: "Mon 18 to today", "Today, Mon 25". */
export function whenLabel(p: ChildSubjectProgress, today: string): string {
  const { startsOn, endsOn, inProgress } = p.window;
  if (inProgress && startsOn === today) return `Today, ${dayLabel(startsOn)}`;
  if (inProgress) return `${dayLabel(startsOn)} to today`;
  return `${dayLabel(startsOn)} to ${dayLabel(endsOn)}`;
}

const WORDS = [
  "No",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
];

/** Who the page is about, in each place a sentence needs them. */
export interface ChildWords {
  /** "Amara", or "Your child" at the start of a sentence. */
  lead: string;
  /** "Amara", or "your child" mid-sentence. */
  mid: string;
  /** "Amara's", or "Your child's". */
  possessive: string;
}

export function childWords(firstName: string | null): ChildWords {
  const name = firstName?.trim();
  return name
    ? { lead: name, mid: name, possessive: `${name}’s` }
    : { lead: "Your child", mid: "your child", possessive: "Your child’s" };
}

export interface WeekCopy {
  heading: string;
  sub: string;
  panel: { title: string; body: string } | null;
}

export function weekCopy(
  kind: WeekKind,
  child: ChildWords,
  subjectCount: number,
  schoolName: string,
): WeekCopy {
  const week: WeekCopy = {
    heading: `${child.possessive} week`,
    sub: `What ${child.mid} covered and mastered in each subject.`,
    panel: null,
  };
  switch (kind) {
    case "quiet":
      return {
        ...week,
        panel: {
          title: "A quiet week so far",
          body: `No Nevo lessons have come through for ${child.mid} since Monday. ${child.possessive} school can tell you more about what’s planned.`,
        },
      };
    case "break":
      return {
        ...week,
        panel: {
          title: `${schoolName} is on break`,
          body: "Nothing is expected this week. Lessons pick up again when school returns.",
        },
      };
    case "first": {
      const count = WORDS[subjectCount] ?? String(subjectCount);
      return {
        heading: `${child.possessive} subjects`,
        sub: `${count} ${subjectCount === 1 ? "subject" : "subjects"}, all set up and ready.`,
        panel: {
          title: `${child.lead} is all set up`,
          body: `As the teachers add lessons, each subject will show what ${child.mid} covered and mastered that week.`,
        },
      };
    }
    case "none":
      return {
        heading: `${child.possessive} subjects`,
        sub: `What ${child.mid} covers and masters will show here, subject by subject.`,
        panel: {
          title: "No subjects yet",
          body: `${child.possessive} subjects appear here once ${schoolName} has set them up.`,
        },
      };
    default:
      return week;
  }
}

export interface CardCopy {
  name: string;
  covered: string | null;
  mastered: string | null;
  note: string | null;
}

/** One subject's card. A line with nothing in it is left out, never blank. */
export function cardCopy(
  s: SubjectProgress,
  kind: WeekKind,
  child: ChildWords,
): CardCopy {
  const base: CardCopy = {
    name: s.subjectName,
    covered: s.covered.length ? s.covered.join(", ") : null,
    mastered: s.masteredThisWindow.length ? s.masteredThisWindow.join(", ") : null,
    note: null,
  };
  if (s.state === "not_started") {
    return {
      ...base,
      note:
        kind === "first"
          ? "Not started yet"
          : `Not started yet. ${child.possessive} first ${s.subjectName} lesson will show here once a teacher adds one.`,
    };
  }
  if (hasWork(s)) return base;
  const note =
    kind === "break"
      ? "School on break"
      : kind === "monday"
        ? "No lessons yet this week"
        : kind === "quiet"
          ? "No lessons this week so far"
          : "No lessons in this subject this week";
  return { ...base, note };
}

/** Today as the bare date the window is written in, on this device. */
export function localToday(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
