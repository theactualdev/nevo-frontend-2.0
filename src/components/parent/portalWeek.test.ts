import { describe, expect, it } from "vitest";
import type { ChildSubjectProgress, SubjectProgress } from "@/lib/api/parent";
import {
  cardCopy,
  childWords,
  dayLabel,
  footLine,
  weekCopy,
  weekKind,
  whenLabel,
} from "./portalWeek";

/**
 * D02's portal home states, B1-B7, from what the server sends. The ones that
 * would hurt if wrong: calling a break a quiet week, claiming a quiet week for
 * a school with no term dates, and any figure the server did not send.
 */

const subject = (over: Partial<SubjectProgress> = {}): SubjectProgress => ({
  subjectId: over.subjectName ?? "maths",
  subjectName: "Mathematics",
  state: "active",
  covered: [],
  masteredThisWindow: [],
  stillWorkingOn: [],
  masteredBeforeWindow: 4,
  ...over,
});

const week = (
  subjects: SubjectProgress[],
  window: Partial<ChildSubjectProgress["window"]> = {},
): ChildSubjectProgress => ({
  studentId: "s1",
  window: {
    startsOn: "2027-01-18",
    endsOn: "2027-01-24",
    state: "in_term",
    inProgress: true,
    ...window,
  },
  subjects,
});

const TODAY = "2027-01-20";
const amara = childWords("Amara");

describe("weekKind", () => {
  it("B1: a week with work in it", () => {
    const p = week([subject({ covered: ["Equivalent fractions"] }), subject({ subjectName: "French" })]);
    expect(weekKind(p, TODAY)).toBe("week");
  });

  it("B2: school was on and nothing came through", () => {
    expect(weekKind(week([subject(), subject({ subjectName: "French" })]), TODAY)).toBe("quiet");
  });

  it("B3: a break is never a quiet week, even with nothing in it", () => {
    expect(weekKind(week([subject()], { state: "in_break" }), TODAY)).toBe("break");
  });

  it("B4: no term dates claims neither a quiet week nor a break", () => {
    expect(weekKind(week([subject()], { state: "terms_not_set" }), TODAY)).toBe("week");
  });

  it("B6: every subject set up and none started", () => {
    const p = week([subject({ state: "not_started" }), subject({ subjectName: "French", state: "not_started" })]);
    expect(weekKind(p, TODAY)).toBe("first");
  });

  it("B7: Monday with nothing yet is not a quiet week", () => {
    expect(weekKind(week([subject()]), "2027-01-18")).toBe("monday");
  });

  it("no subjects at all is its own nothing-state", () => {
    expect(weekKind(week([]), TODAY)).toBe("none");
  });
});

describe("whenLabel", () => {
  it("reads the week in progress up to today", () => {
    expect(whenLabel(week([]), TODAY)).toBe("Mon 18 to today");
  });

  it("names Monday itself on a Monday", () => {
    expect(whenLabel(week([]), "2027-01-18")).toBe("Today, Mon 18");
  });

  it("gives a finished week both ends", () => {
    expect(whenLabel(week([], { inProgress: false }), TODAY)).toBe("Mon 18 to Sun 24");
  });

  it("reads a bare date as written, not shifted a day by UTC", () => {
    expect(dayLabel("2027-01-18")).toBe("Mon 18");
  });
});

describe("weekCopy", () => {
  it("names the child rather than guessing a pronoun", () => {
    const c = weekCopy("week", amara, 9, "Corona Secondary School");
    expect(c.heading).toBe("Amara’s week");
    expect(c.sub).toBe("What Amara covered and mastered in each subject.");
    expect(`${c.heading} ${c.sub}`).not.toMatch(/\b(she|her|he|his)\b/i);
  });

  it("B2's panel says it is quiet, with no verdict on the child", () => {
    const c = weekCopy("quiet", amara, 9, "Corona Secondary School");
    expect(c.panel?.title).toBe("A quiet week so far");
    expect(c.panel?.body).toMatch(/No Nevo lessons have come through for Amara since Monday/);
  });

  it("B3's panel names the school's break", () => {
    const c = weekCopy("break", amara, 9, "Corona Secondary School");
    expect(c.panel?.title).toBe("Corona Secondary School is on break");
    expect(c.panel?.body).not.toMatch(/quiet/i);
  });

  it("B6 counts the subjects it was sent", () => {
    const c = weekCopy("first", amara, 9, "Corona Secondary School");
    expect(c.heading).toBe("Amara’s subjects");
    expect(c.sub).toBe("Nine subjects, all set up and ready.");
    expect(c.panel?.title).toBe("Amara is all set up");
  });

  it("falls back to 'your child' when the name is missing", () => {
    const c = weekCopy("week", childWords(null), 3, "Corona");
    expect(c.heading).toBe("Your child’s week");
    expect(c.sub).toBe("What your child covered and mastered in each subject.");
  });

  it("no week shows a panel unless it says something", () => {
    expect(weekCopy("week", amara, 9, "x").panel).toBeNull();
    expect(weekCopy("monday", amara, 9, "x").panel).toBeNull();
  });
});

describe("cardCopy", () => {
  it("lists what was covered and mastered, by name", () => {
    const c = cardCopy(
      subject({ covered: ["Fractions on a number line", "equivalent fractions"], masteredThisWindow: ["Equivalent fractions"] }),
      "week",
      amara,
    );
    expect(c.covered).toBe("Fractions on a number line, equivalent fractions");
    expect(c.mastered).toBe("Equivalent fractions");
    expect(c.note).toBeNull();
  });

  it("shows no count the server did not send - masteredBeforeWindow is not summed", () => {
    const c = cardCopy(subject({ covered: ["x"], masteredThisWindow: ["x"], masteredBeforeWindow: 4 }), "week", amara);
    expect(JSON.stringify(c)).not.toMatch(/\d/);
  });

  it("B5: a subject not started is shown, never hidden", () => {
    const c = cardCopy(subject({ subjectName: "French", state: "not_started" }), "week", amara);
    expect(c.note).toBe("Not started yet. Amara’s first French lesson will show here once a teacher adds one.");
  });

  it("B6: the short note when nothing has started anywhere", () => {
    expect(cardCopy(subject({ state: "not_started" }), "first", amara).note).toBe("Not started yet");
  });

  it("says why a card is empty, in the week's own terms", () => {
    expect(cardCopy(subject(), "week", amara).note).toBe("No lessons in this subject this week");
    expect(cardCopy(subject(), "quiet", amara).note).toBe("No lessons this week so far");
    expect(cardCopy(subject(), "break", amara).note).toBe("School on break");
    expect(cardCopy(subject(), "monday", amara).note).toBe("No lessons yet this week");
  });
});

/**
 * 14 Oct: the server sends `masteredSoFar` (its own total), `lastLessonAt` and
 * `window.kind`, so D02a's foot and B4's "Since setup" are drawn.
 */
describe("the foot line", () => {
  it("B1: the total, up from last week when a topic was mastered this week", () => {
    const s = subject({ covered: ["x"], masteredThisWindow: ["Equivalent fractions"], masteredBeforeWindow: 4, masteredSoFar: 5 });
    expect(footLine(s, "week")).toBe("5 topics mastered so far, up from 4 last week");
  });

  it("B1: the same as last week when none was", () => {
    const s = subject({ covered: ["x"], masteredBeforeWindow: 3, masteredSoFar: 3 });
    expect(footLine(s, "week")).toBe("3 topics mastered so far, same as last week");
  });

  it("reads naturally at one, and says none yet at zero", () => {
    expect(footLine(subject({ covered: ["x"], masteredSoFar: 1, masteredBeforeWindow: 1 }), "week")).toBe(
      "1 topic mastered so far, same as last week",
    );
    expect(footLine(subject({ covered: ["x"], masteredSoFar: 0, masteredBeforeWindow: 0 }), "week")).toBe(
      "No topics mastered yet",
    );
  });

  it("B2: a subject with nothing this week says when its last lesson was", () => {
    const s = subject({ masteredSoFar: 3, lastLessonAt: "2027-01-14T10:00:00Z" });
    expect(footLine(s, "quiet")).toBe("Last lesson Thu 14 Jan");
    expect(footLine(s, "week")).toBe("Last lesson Thu 14 Jan");
    // Never had one: no line, rather than a guess.
    expect(footLine(subject({ masteredSoFar: 0, lastLessonAt: null }), "quiet")).toBeNull();
  });

  it("B3 and B7: a break or a Monday shows the total alone", () => {
    const s = subject({ masteredSoFar: 3, masteredBeforeWindow: 3 });
    expect(footLine(s, "break")).toBe("3 topics mastered so far");
    expect(footLine(s, "monday")).toBe("3 topics mastered so far");
  });

  it("B4, B5 and B6 have no foot", () => {
    const s = subject({ covered: ["x"], masteredSoFar: 5 });
    expect(footLine(s, "since_setup")).toBeNull();
    expect(footLine(subject({ state: "not_started", masteredSoFar: 0 }), "week")).toBeNull();
    expect(footLine(s, "first")).toBeNull();
  });

  it("draws no total the server did not send", () => {
    expect(footLine(subject({ covered: ["x"], masteredThisWindow: ["x"] }), "week")).toBeNull();
  });
});

describe("B4: since setup", () => {
  const sinceSetup = week([subject({ covered: ["Number bases"] }), subject({ subjectName: "Civic Education" })], {
    state: "terms_not_set",
    kind: "since_setup",
  });

  it("is its own state, never a week, a quiet week or a break", () => {
    expect(weekKind(sinceSetup, "2027-01-20")).toBe("since_setup");
  });

  it("labels each card Since setup, with no dates", () => {
    expect(whenLabel(sinceSetup, "2027-01-20")).toBe("Since setup");
  });

  it("calls the page the child's subjects, since the school set up Nevo", () => {
    const copy = weekCopy("since_setup", amara, 2, "Corona Secondary School");
    expect(copy.heading).toBe("Amara’s subjects");
    expect(copy.sub).toBe("What Amara has covered and mastered since Corona Secondary School set up Nevo.");
    expect(copy.panel).toBeNull();
  });

  it("says a subject has had no lessons since setup", () => {
    expect(cardCopy(subject(), "since_setup", amara).note).toBe("No lessons in this subject since setup");
  });
});
