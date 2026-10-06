import { getLibraryLesson } from "./teacherLibrary";
import { getStudentProfile } from "./teacherStudents";

/**
 * Ask Nevo, teacher side - rebuilt against the rewritten `Nevo Teacher Ask`
 * component (the previous `Nevo Teacher Ask Nevo` frame was deleted; git
 * scores the replacement 19% similar, so this is a new contract, not an
 * edit). Seven contexts now, keyed off the route, each with its own context
 * strip line, lead, chips and canned turn.
 *
 * Copy is frame-verbatim, apostrophes included: the frame is pure ASCII
 * apart from the curly quotes inside the connect answer, so these straight
 * quotes are deliberate - do not "upgrade" them.
 *
 * NOT A TODO: this describes the shipped behaviour, not a gap. The live
 * assistant answers first - `askNevoApi.ask` in `Shell/AskNevo.tsx` - and
 * these canned turns are the fallback so the drawer never goes silent. A
 * fallback answer is marked as one on screen.
 */

export type AskNevoContext =
  | "home"
  | "classes"
  | "student"
  | "library"
  | "lesson"
  | "insights"
  | "connect";

export interface AskNevoContextData {
  /** Context-strip copy. "on" = a screen you stand in, "viewing" = a record you have open. */
  strip: string;
  lead: string;
  sub: string;
  chips: [string, string, string];
  /** The canned turn this context demos. */
  question: string;
  answer: string;
  /** Exactly one action pill per context, per the frame. */
  action: { label: string; href: string };
}

export const ASK_NEVO_CONTEXTS: Record<AskNevoContext, AskNevoContextData> = {
  home: {
    strip: "You're on: Home",
    lead: "What can I help you see today?",
    sub: "Ask about your morning, a flagged student, or where to start.",
    chips: [
      "What needs my attention today?",
      "Why is this student flagged?",
      "What should I prioritise first?",
    ],
    question: "What needs my attention today?",
    answer:
      "Three things are worth your eye: Tunde stalled on Tuesday and it's worth a quiet word, Amara's taking longer on written parts, and eight in JSS 2A slowed on the same fractions step. Everything else is steady.",
    action: {
      label: "Open Tunde's profile",
      href: "/teacher/students/tunde-adeyemi",
    },
  },
  classes: {
    strip: "You're on: My Classes",
    lead: "Ask me about your classes.",
    sub: "How a class is doing, who needs a look, and the pattern underneath.",
    chips: [
      "How is this class doing overall?",
      "Which students need attention?",
      "What's the engagement pattern for this class?",
    ],
    question: "How is this class doing overall?",
    answer:
      "JSS 2A is mostly settled, with three students worth a glance - Amara, Tunde, and Chisom. The pattern is a slow-down on the written segments rather than on the understanding underneath.",
    action: { label: "See the roster", href: "/teacher/classes" },
  },
  student: {
    strip: "You're viewing: Amara Okafor",
    lead: "Ask me about Amara.",
    // ALL THREE OF THESE FAILED THE RULE, and the middle one twice. "What
    // suits her now" asks Nevo what a child prefers; "how her confidence is
    // tracking" attaches a confidence reading to a named child, which is the
    // one thing the rule names outright. A prompt chip is copy: it teaches a
    // teacher what Nevo is for.
    sub: "Amara's recent sessions, and what Nevo has noticed.",
    chips: [
      "What's going on with Amara?",
      "What has Nevo noticed this week?",
      "Which lesson comes next for Amara?",
    ],
    question: "What's going on with Amara?",
    // Four findings in one paragraph: "engagement has been strong", "which
    // usually means the content is landing" (an inference), "slower than the
    // class average" (a child ranked against peers), and "not struggling",
    // which is still a claim about struggle. What is left is the sessions.
    answer:
      "Amara has taken longer on the written segments in each of the last three sessions, and finished all three. Nothing else has changed this week.",
    action: {
      label: "Recommend a lesson",
      href: "/teacher/students/amara-okafor/recommend",
    },
  },
  library: {
    strip: "You're on: Lesson Library",
    lead: "Ask me about a lesson.",
    sub: "Whether it fits your class, how I'll adapt it, and who might need support.",
    chips: [
      "Is this lesson right for my class?",
      "How will Nevo adapt this lesson?",
      // Was "Which students might struggle with this?" - a prompt asking Nevo
      // to predict which children will struggle, which is a finding about each
      // of them before the lesson has run.
      "Who slowed on this concept last time?",
    ],
    question: "Is this lesson right for my class?",
    answer:
      "It's a good fit. The concept lines up with where JSS 2A is now, and the lesson opens with a real-world framing. Nevo will offer each student whichever version fits the moment.",
    action: { label: "Preview lesson", href: "/teacher/lessons" },
  },
  lesson: {
    strip: "You're viewing: Fractions in Everyday Life",
    lead: "Ask me about this lesson.",
    sub: "Whether it fits your class, how I'll adapt it, and who might need support.",
    chips: [
      "Is this lesson right for my class?",
      "How will Nevo adapt this lesson?",
      "Who slowed on this concept last time?",
    ],
    question: "Is this lesson right for my class?",
    answer:
      // Rule 1: this offered an "audio-led path" to the students who had been
      // slowing - a version chosen for named children. The library answer's
      // own sentence says what Nevo actually does.
      "It's a good fit for JSS 2A. The concept matches where they are, and it opens with a real-world framing. Nevo will offer each student whichever version fits the moment.",
    action: { label: "Assign to JSS 2A", href: "/teacher/lessons/assign" },
  },
  insights: {
    strip: "You're on: Insights, JSS 2A",
    lead: "Ask me about this class.",
    sub: "Where to focus, what a pattern means, and what I'd suggest doing.",
    chips: [
      "What should I prioritise for this class?",
      "What does this pattern mean?",
      "What would you recommend I do?",
    ],
    question: "What should I prioritise for this class?",
    answer:
      "Three students slowed significantly on the algebraic fractions segment - Tunde, Chisom, and Bello. It's worth revisiting that concept before moving on. There is a hands-on lesson on the same concept if you would rather come at it another way.",
    action: { label: "Find a hands-on lesson", href: "/teacher/lessons" },
  },
  connect: {
    // The 25 Aug drop moved parents to their own portal and rewrote the Connect
    // frames without them, but this overlay - added in the same commit - still
    // named a parent thread. Reworded rather than built verbatim, and sent back
    // to design. The strip stays thread-agnostic on purpose: Connect
    // threads are local state with no route segment, so naming a student here
    // would read "Amara" while the teacher is looking at Tunde's thread.
    strip: "You're on: Connect",
    lead: "Let's shape this message.",
    sub: "I can help you frame progress, tone, and where to start.",
    chips: [
      "How should I frame this message?",
      "How should I talk about this week's progress?",
      "What's the best way to approach this conversation?",
    ],
    question: "How should I frame this message?",
    // The draft is addressed to the student, so the register moves with it.
    // The closing line used to read "You take your time with written work -
    // that's care, not struggle", which tells a child what they are and
    // mentions struggle to deny it. A teacher may of course say that; Nevo
    // must not draft it for them.
    answer:
      "Keep it progress-focused rather than concern-focused. Something like: “You've put real effort in this week, Amara, and it's showing in the work.”",
    action: { label: "Use this as a draft", href: "/teacher/connect" },
  },
};

/** The surface the teacher opened the drawer from, read off the route. */
export function contextForPath(pathname: string): AskNevoContext {
  if (/^\/teacher\/students\/[^/]+/.test(pathname)) return "student";
  if (pathname.startsWith("/teacher/classes")) return "classes";
  // A lesson RECORD, not the assign or upload flows that share its prefix -
  // which the drawer used to greet with "You're viewing: Fractions in
  // Everyday Life".
  if (/^\/teacher\/lessons\/(?!assign\b|upload\b)[^/]+/.test(pathname)) {
    return "lesson";
  }
  if (pathname.startsWith("/teacher/lessons")) return "library";
  if (pathname.startsWith("/teacher/insights")) return "insights";
  if (pathname.startsWith("/teacher/connect")) return "connect";
  return "home";
}

/** Record contexts name the real thing on screen, not the frame's fixture. */
export function stripForPath(
  context: AskNevoContext,
  pathname: string,
): string {
  const slug = pathname.split("/")[3] ?? "";
  if (context === "student") {
    const student = getStudentProfile(slug);
    if (student) return `You're viewing: ${student.name}`;
  }
  if (context === "lesson") {
    const lesson = getLibraryLesson(slug);
    if (lesson) return `You're viewing: ${lesson.title}`;
  }
  return ASK_NEVO_CONTEXTS[context].strip;
}

/**
 * WHAT A SIGNED-IN TEACHER IS SHOWN on a record page.
 *
 * The contexts above are the frame's, and they name the frame's people:
 * "Ask me about Amara", "What's going on with Amara?", "Insights, JSS 2A".
 * The strip resolved a real page through the FIXTURE lookups, which find
 * nothing for a real id, so every real student, lesson and Insights page fell
 * back to the invented child - and a chip sent that invented name to the live
 * assistant about a different, real child.
 *
 * The drawer has no read of its own for the record's name, so it does not
 * claim one: the strip names the screen only, and the prompts say "this
 * student", as the lesson and class contexts already say "this lesson" and
 * "this class".
 */
export function liveContextFor(context: AskNevoContext): AskNevoContextData {
  const base = ASK_NEVO_CONTEXTS[context];
  if (context === "student") {
    return {
      ...base,
      lead: "Ask me about this student.",
      sub: "Their recent sessions, and what Nevo has noticed.",
      chips: [
        "What's going on with this student?",
        "What has Nevo noticed this week?",
        "Which lesson comes next for this student?",
      ],
    };
  }
  return base;
}

/** The strip for a signed-in teacher: the screen, never a record it cannot name. */
export function liveStripFor(context: AskNevoContext): string | null {
  if (context === "student" || context === "lesson") return null;
  if (context === "insights") return "You're on: Insights";
  return ASK_NEVO_CONTEXTS[context].strip;
}

/**
 * The record the teacher has open, as the ids the assistant can scope to.
 * Only real ids: a fixture slug on the walkthrough is not one, and `asUuid`
 * keeps it out.
 */
export function contextIdsFor(pathname: string): {
  studentId?: string;
  classId?: string;
  lessonId?: string;
} {
  const [, , section, id] = pathname.split("/");
  const uuid =
    id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
      ? id
      : null;
  if (!uuid) return {};
  if (section === "students") return { studentId: uuid };
  if (section === "classes") return { classId: uuid };
  if (section === "lessons") return { lessonId: uuid };
  return {};
}

/** Requests outside the assistant's remit get the admin hand-off, verbatim. */
export const OUT_OF_SCOPE =
  /\b(allowance|approve|billing|invoice|pay|password|reset|account|admin|seat|permission|refund|sso|delete)\b/i;

export const CANNOT_HELP_LINE =
  "That's outside what I can help with here. Your school admin looks after that side of things.";
