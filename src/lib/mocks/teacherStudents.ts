import type { ObservationPattern } from "@/lib/api/classes";
import { OBSERVATION_COPY } from "@/lib/constants/observations";
import { TEACHER_CLASSES, type TeacherClass } from "./teacherClasses";

/**
 * Student-profile mock data (C08). The frame draws two states: a full profile
 * with enough history (Amara Okafor) and an early / low-confidence profile
 * for a student Nevo is still learning (drawn with Zainab Yusuf).
 *
 * Every roster student resolves: the one with a written profile gets the full
 * page, everyone else gets the designed early state carrying their own name
 * and class. There is no confidence rating, and no clinical language
 * anywhere - the page has to hold up if a
 * parent or the SENCo reads it.
 *
 * BOTH HALVES OF THIS ARE NOW FALSE (verified against the deployed spec,
 * 11 Sep 2026), and the second was never quite right:
 *
 *  - `/api/v1/students/{id}/profile` and `/api/intelligence/profile/{id}` are
 *    wired. `useStudentProfile` calls `studentsApi`, and `StudentRoute:32`
 *    consumes it.
 *  - Per-student observations DO have a source. They are not their own path,
 *    which is why searching the spec for one finds nothing: they arrive nested
 *    as `observations` on `ClassStudentResponse`, from
 *    `GET /api/v1/classes/{class_id}/students`, and are already typed at
 *    `lib/api/classes.ts:100`. A schema with no path of its own is reached
 *    through another response - a spec search that only reads path names will
 *    keep declaring these orphaned.
 */

/*
 * WHAT THIS SCREEN SAYS ABOUT A CHILD COMES FROM ONE PLACE, and it is not here.
 *
 * C08 used to carry its own sentences with a confidence rating beside each:
 * "Prefers to hear an explanation before reading it herself" at "Clear
 * pattern". Three violations of rule 1 in one card - a stored preference about
 * a named child, a modality claim, and a confidence rating that turns an
 * observation into a finding.
 *
 * Design ruled on 17 Sep that rule 1 wins, that the frame predates the
 * solution, and that C08 uses the sanctioned observation vocabulary from C16b
 * instead - naming `tried_another_format` as the line that replaces the
 * modality one. So the profile now holds PATTERNS and the wording lives in
 * `lib/constants/observations.ts`, shared with the roster chips. One source,
 * so the two screens cannot drift into saying different things about the same
 * child.
 *
 * The confidence rating is gone entirely, per the same ruling.
 *
 * AND THE CONCEPT GOES WITH IT (design, 17 Sep, second ruling the same day).
 * Replacing the sentences inside `dimensions` treated the symptom: the
 * structure existed to characterise a child, and confidence-rated claims about
 * how a child learns is what it was for. There is no version of it that
 * survives rule 1, and `LearnerObservationPattern` already exists, is closed,
 * and is the sanctioned vocabulary - so a parallel structure doing the same
 * job worse had no reason to exist. The field is `observations` now, typed on
 * the enum directly, with no local alias standing between them.
 */

export interface ConceptMastery {
  name: string;
  /** 0-100. */
  u: number;
  /** 0-100. */
  r: number;
  /** Overrides the component's auto label; "none" suppresses it. */
  flag?: string;
}

export interface EvidenceItem {
  concept: string;
  badge: "Demonstrated" | "Developing";
  when: string;
  desc?: string;
}

export interface SessionStep {
  title: string;
  note: string;
  /** true = spent longer on this section (violet clock), false = moved straight
   *  through (navy check). Describes the session, never the child. */
  took: boolean;
}

export interface SessionRow {
  id: string;
  date: string;
  /** Long form for the panel eyebrow: "9 Jul" -> "9 July". */
  dateLong: string;
  lesson: string;
  note: string;
  /** Panel subtitle tail, e.g. "finished in two sittings". Designed for the
   *  9 Jul session only; omitted elsewhere rather than invented. */
  sitting?: string;
  /** Panel summary card. The tablet line is a rewrite, not a truncation. */
  summary?: { desktop: string; tablet: string };
  /** Section-by-section list; only the 9 Jul session is designed (C08d). */
  steps?: SessionStep[];
}

export interface LessonOption {
  id: string;
  lesson: string;
  /** "listen-first" / "standard"; absent when the lesson has no variant. */
  version?: string;
  meta: string;
  suggested?: boolean;
}

export interface RecommendData {
  /** Nevo's reason, in a colleague's voice. Tablet is a shorter rewrite. */
  suggestDesktop: string;
  suggestTablet: string;
  /** The emphasised run inside the desktop reason, bolded per the frame. */
  suggestStrong: string;
  options: LessonOption[];
}

export interface StudentProfileData {
  id: string;
  name: string;
  initials: string;
  classId: string;
  className: string;
  /** Meta line under the name. */
  meta: string;
  /** Present only on the full profile. */
  chip?: string;
  /** The "This week" noticing banner - desktop and its compressed tablet line. */
  noticing?: { desktop: string; tablet: string };
  /** The early state's calm callout; mutually exclusive with `noticing`. */
  earlyNote?: string;
  /*
   * `pronoun` IS DELETED (17 Sep). It read: "Carried explicitly so the designed
   * copy stays exact; never inferred from a name. Students without a recorded
   * pronoun read as they/them."
   *
   * v3.0 frontend section 6 overturns the premise: "No pronoun is stored for
   * any child and there is no field that could make it right." There is no
   * recorded pronoun to carry - the deployed spec has no pronoun property on
   * any schema - so this field was a fixture invention, and its one reader
   * (`RecommendSheet`) interpolated it into copy a teacher reads about a named
   * child. Copy uses the NAME.
   */
  /** The sanctioned patterns, straight off the enum. Never local prose. */
  observations: ObservationPattern[];
  /** The count C08 draws as a chip, where the copy file allows one. */
  observationCounts?: Partial<Record<ObservationPattern, number>>;
  concepts: ConceptMastery[];
  evidence: EvidenceItem[];
  sessions: SessionRow[];
  /** C08c. Only students with a full profile can be recommended to. */
  recommend?: RecommendData;
}



/** Matches the roster links already in place: name -> "amara-okafor". */
export const studentSlug = (name: string) =>
  name.toLowerCase().replace(/\s+/g, "-");

const AMARA: Omit<StudentProfileData, "classId" | "className"> = {
  id: "amara-okafor",
  name: "Amara Okafor",
  initials: "AO",
  meta: "JSS 2A · Mathematics & English",
  chip: "Worth a glance",
  recommend: {
    suggestDesktop:
      // C08c, as corrected on 17 Sep: a next step, not a modality that
      // "would play to" how the week went. The frame's "for her" becomes the
      // child's name - nothing stores a pronoun (frontend section 6).
      "Since Amara's been slower on written work lately, \"Simplifying Expressions\" is a good next step for Amara.",
    suggestStrong: '"Simplifying Expressions"',
    suggestTablet:
      "Since Amara's been slower on written work, \"Simplifying Expressions\" is a good next step for Amara.",
    options: [
      {
        id: "simplifying-expressions-listen-first",
        lesson: "Simplifying Expressions",
        version: "listen-first",
        meta: "Audio-led · 5 sections",
        suggested: true,
      },
      {
        id: "simplifying-expressions-standard",
        lesson: "Simplifying Expressions",
        version: "standard",
        meta: "Text-led · 5 sections",
      },
      {
        id: "algebraic-word-problems",
        lesson: "Algebraic Word Problems",
        meta: "Text-led · 4 sections",
      },
    ],
  },
  /*
   * TWO CLAUSES DELETED, not reworded.
   *
   * "She settles faster when she can hear it first" is a modality claim about a
   * named child, which rule 1 forbids wherever it appears - and this is the
   * same frame design corrected on 17 Sep, so it is the same defect rather than
   * a second one. "She's getting there" guesses a pronoun, which section 6
   * rules out for the reason the deleted `pronoun` field above records: nothing
   * stores one and no field could make it right.
   *
   * Deleting a claim is not inventing a replacement. What is left is the
   * observation design wrote, minus the two parts that were not theirs to
   * assert. If design would rather word it differently, this is one string.
   */
  noticing: {
    desktop:
      "Amara has been taking longer on the written segments - three sessions running.",
    tablet: "longer on written segments, three sessions running",
  },
  // `tried_another_format` is the line design named as the replacement for the
  // modality claim. It says a child has worked in more than one way and names
  // no format, which is the whole point.
  // C08's four, in its order, with its count on finished lessons.
  observations: [
    "completed_lessons",
    "tried_another_format",
    "steadier_pace",
    "revisited_content",
  ],
  observationCounts: { completed_lessons: 12 },
  // None of these four trip the component's auto-flag thresholds, so no flag
  // pill renders on this data - that is the frame's intent, not a gap.
  concepts: [
    { name: "Solving linear equations", u: 84, r: 66 },
    { name: "Simplifying expressions", u: 79, r: 63 },
    { name: "Algebraic fractions", u: 58, r: 60 },
    { name: "Comprehension: prose texts", u: 86, r: 72 },
  ],
  evidence: [
    { concept: "Solving linear equations", badge: "Demonstrated", when: "Yesterday" },
    { concept: "Comprehension: prose texts", badge: "Demonstrated", when: "Monday" },
    {
      concept: "Algebraic fractions",
      badge: "Developing",
      when: "2 days ago",
      desc: OBSERVATION_COPY.steadier_pace.body("Amara"),
    },
    { concept: "Simplifying expressions", badge: "Demonstrated", when: "3 days ago" },
  ],
  // Session titles are Title Case here and sentence case in the mastery and
  // evidence lists - reproduced from the frame; flagged to design.
  sessions: [
    {
      id: "9-jul",
      date: "9 Jul",
      dateLong: "9 July",
      lesson: "Solving Linear Equations",
      note: "Worked through it in two sittings. Took the listen-first route on the second half and finished comfortably.",
      sitting: "finished in two sittings",
      summary: {
        desktop:
          // C08d: what the child did, never that a format "seemed to help".
          // The frame's pronouns become the name, as above.
          "Amara took time over the written practice and stepped away once, then came back the next morning and finished comfortably. Amara switched to the listen-first explanation partway through.",
        tablet:
          "Took time over the written practice, stepped away once, came back the next morning and finished. Switched to listen-first partway through.",
      },
      steps: [
        { title: "What an equation is", note: "Straight through - this was familiar ground.", took: false },
        { title: "Keeping both sides balanced", note: "Watched the worked example twice, then moved on.", took: false },
        { title: "Solving for x", note: "Comfortable here.", took: false },
        {
          title: "Equations with x on both sides",
          note: "Took time here - this is where Amara paused and came back the next day.",
          took: true,
        },
        { title: "Word problems", note: "Switched to listen-first and it went more smoothly.", took: false },
        { title: "A tricky one", note: "Gave it a good try and got most of the way.", took: false },
      ],
    },
    // C08d designs the section-by-section detail for the 9 Jul session only.
    // The rest open the same panel carrying their own designed note as the
    // summary; the section list is omitted rather than invented.
    {
      id: "8-jul",
      date: "8 Jul",
      dateLong: "8 July",
      lesson: "Simplifying Expressions",
      note: "Straight through, no breaks needed.",
    },
    {
      id: "5-jul",
      date: "5 Jul",
      dateLong: "5 July",
      lesson: "Introduction to Algebra",
      note: "Slower on the written practice, but got there. Stepped away once and picked it back up fine.",
    },
    {
      id: "3-jul",
      date: "3 Jul",
      dateLong: "3 July",
      lesson: "Comprehension: Things Fall Apart",
      // "Strong on this" was a strength indicator attached to a child, which
      // the copy rule rules out however mild it reads. What is left is what
      // happened, which was the substance anyway.
      note: "Finished early and answered the stretch question.",
    },
  ],
};

// The early picture, in the sanctioned wording. "May prefer shorter segments"
// was a preference claim hedged with "still early to say", and a hedge does not
// stop it being one. `no_recent_pattern` is the vocabulary's own reading for
// not-enough-yet, and it says so without implying anything about the child.
const EARLY_OBSERVATIONS: ObservationPattern[] = ["no_recent_pattern"];

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

function classOf(name: string): TeacherClass | null {
  return (
    TEACHER_CLASSES.find((c) => c.roster.some((s) => s.name === name)) ?? null
  );
}

export function getStudentProfile(slug: string): StudentProfileData | null {
  const student = TEACHER_CLASSES.flatMap((c) => c.roster).find(
    (s) => studentSlug(s.name) === slug,
  );
  if (!student) return null;
  const klass = classOf(student.name);
  if (!klass) return null;

  if (studentSlug(student.name) === AMARA.id) {
    return { ...AMARA, classId: klass.id, className: klass.name };
  }

  // Everyone else renders the designed early / low-confidence state.
  return {
    id: studentSlug(student.name),
    name: student.name,
    initials: initialsOf(student.name),
    classId: klass.id,
    className: klass.name,
    meta: `${klass.name} · joined 6 days ago`,
    // Opening clause deleted: "Still learning how X learns best" is the same
    // modality framing in a hedge, and a hedge does not stop it being a claim.
    earlyNote: `A few more sessions and this will fill in - for now, here's the early picture.`,
    observations: EARLY_OBSERVATIONS,
    concepts: [],
    evidence: [],
    sessions: [],
  };
}

export function getSession(
  slug: string,
  sessionId: string,
): { student: StudentProfileData; session: SessionRow } | null {
  const student = getStudentProfile(slug);
  const session = student?.sessions.find((s) => s.id === sessionId);
  if (!student || !session) return null;
  return { student, session };
}
