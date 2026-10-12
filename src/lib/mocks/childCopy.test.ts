import { describe, expect, it } from "vitest";
import * as askNevo from "./teacherAskNevo";
import * as connect from "./teacherConnect";
import * as home from "./teacherHome";
import * as insights from "./teacherInsights";
import * as intelligence from "./teacherIntelligence";
import * as library from "./teacherLibrary";
import * as notifications from "./teacherNotifications";
import { TEACHER_CLASSES } from "./teacherClasses";
import { getStudentProfile, studentSlug } from "./teacherStudents";

/**
 * THE COPY SWEEP, MADE MECHANICAL.
 *
 * Design ran the child-labelling sweep across the design repo on 17 Sep and
 * reported the modality-copy family fixed at its sources. It was - in the
 * frames. Code carries its own copies of the same strings, so the signed-out
 * console went on saying that Chisom "keeps doing better when a lesson leads
 * with audio", that a stall was "really not like him", and that Amara "tends
 * to settle faster when she can hear it first", for as long as nobody looked.
 * The audit covered what the product was designed to say and not what it
 * actually says, which is the half that ships.
 *
 * THE RULE, as it now stands at the top of the copy audit: copy about a child
 * may say what Nevo did. It may never say what the child is, prefers, tends
 * to do, is better at, struggles with, or responds well to. No confidence
 * level, certainty rating or strength indicator may be attached to any
 * statement about a child.
 *
 * This file is that rule over every teacher fixture a signed-out visitor can
 * read - the only surface where being wrong costs us in public.
 * `teacherStudents.test.ts` next door does the same job for the profile and
 * its sanctioned observations; the two are separate files because they guard
 * different vocabularies.
 *
 * IT WALKS VALUES, NOT SOURCE, for two reasons. A grep over the source would
 * trip on the comments that record what was removed - and it would miss the
 * copy that is not exported at all. `INSIGHTS` is a module-private const
 * reachable only through `getClassInsights`, and the first version of this
 * file did not cover a word of it: a mutation run put "uncharacteristic" back
 * into a flag note and every test still passed. The accessors are called
 * below for exactly that reason.
 */

/** Every string reachable from a value, however deeply nested. */
function stringsIn(value: unknown, seen = new Set<unknown>()): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "function") return [];
  if (value === null || typeof value !== "object") return [];
  if (seen.has(value)) return [];
  seen.add(value);
  return Object.values(value).flatMap((v) => stringsIn(v, seen));
}

const MODULES = {
  askNevo,
  connect,
  home,
  insights,
  intelligence,
  library,
  notifications,
};

const CLASS_IDS = TEACHER_CLASSES.map((c) => c.id);

/**
 * The copy: every exported string, plus what the modules' own functions
 * build. A canned answer is copy even though it arrives through a call.
 */
const COPY: [string, string][] = [
  ...Object.entries(MODULES).flatMap(([name, mod]) =>
    stringsIn(mod).map((s): [string, string] => [name, s]),
  ),
  ...[
    "what needs my attention today",
    "why is this flagged",
    "what should I prioritise",
    "anything else",
  ].map((q): [string, string] => [
    "home.teacherAnswerFor",
    home.teacherAnswerFor(q),
  ]),
  ...CLASS_IDS.flatMap((id) =>
    stringsIn(insights.getClassInsights(id)).map((s): [string, string] => [
      `insights.getClassInsights(${id})`,
      s,
    ]),
  ),
  ...library.LIBRARY_LESSONS.flatMap((l) =>
    stringsIn(library.getLibraryLesson(l.id)).map((s): [string, string] => [
      `library.getLibraryLesson(${l.id})`,
      s,
    ]),
  ),
  /*
   * THE PROFILE, ITS SESSIONS AND ITS RECOMMEND SHEET. Left out until 12 Oct,
   * which is how "Switched to listen-first and it went more smoothly" sat in a
   * session step under the rule below that bans exactly that sentence. Design's
   * §3 correction named profile, Recommend and session detail; this walks all
   * three, for every child the sample roster can open.
   */
  ...TEACHER_CLASSES.flatMap((c) => c.roster).flatMap((r) =>
    stringsIn(getStudentProfile(studentSlug(r.name))).map(
      (s): [string, string] => [`students.getStudentProfile(${r.name})`, s],
    ),
  ),
];

/**
 * ALLOWED, EACH WITH ITS REASON. Nothing lands here for being inconvenient.
 *
 * The two `lookingAhead` lines say a CLASS tends to slow at a particular step.
 * The rule governs copy about a child, and a cohort is not a child - but it is
 * the same shape of claim one level up, so they are logged as findings in the
 * copy audit rather than quietly rewritten here. When design rules on them
 * these entries go, in either direction.
 */
const ALLOWED = new Map<string, string>([
  [
    "Keep an eye on JSS 2B next week - algebraic fractions are coming up, and that step tends to be where this group slows. Worth a few minutes on common denominators before you start.",
    "class-level tendency, not a child: logged in the copy audit, awaiting a ruling",
  ],
  [
    "Keep an eye on JSS 2B next week - algebraic fractions are coming up, and that's where this group tends to slow.",
    "the tablet half of the same line",
  ],
]);

const candidates = COPY.filter(([, s]) => !ALLOWED.has(s));

/** Nevo's own uncertainty is not a rating of a child. */
const ABOUT_NEVO = /\bNevo (was|is|cannot|could not|has not)\b/i;

describe("what the teacher fixtures say about a child", () => {
  it("has copy to check at all", () => {
    // A refactor that empties a fixture must not turn this file green.
    expect(candidates.length).toBeGreaterThan(120);
  });

  it("claims no preference, tendency or aptitude", () => {
    const claim =
      /\b(prefers?|preference|tends? to|learns best|is better (at|with)|does better|doing better|best (with|when)|good at|thrives|picks up .* fastest|suits (her|him|them|this))\b/i;

    for (const [where, s] of candidates) {
      expect(s, `${where}: "${s}"`).not.toMatch(claim);
    }
  });

  it("names no struggle and no deficit", () => {
    // Including the denial. "She's working through it, not struggling" is a
    // claim about struggle with a negation in front of it.
    const deficit =
      /\b(struggl\w*|needs support|support needed|weak(ness)?|behind the class)\b/i;

    for (const [where, s] of candidates) {
      expect(s, `${where}: "${s}"`).not.toMatch(deficit);
    }
  });

  it("attaches no confidence, certainty or strength rating", () => {
    const rating =
      /\b(confidence|confident|clear pattern|emerging|certainty|strongly|strong (week|finish|recall|start)|engagement has been strong)\b/i;

    for (const [where, s] of candidates) {
      if (ABOUT_NEVO.test(s)) continue;
      expect(s, `${where}: "${s}"`).not.toMatch(rating);
    }
  });

  it("attributes no outcome to a format", () => {
    // The modality family, which is what this whole sweep was about. It
    // survives a rewrite that drops the pronoun: "settles faster when the
    // lesson leads with audio" says the same thing about the same child. What
    // a lesson DID may name its format; what a child gets out of a format may
    // not be stated at all.
    const fit =
      /\b(audio|visual|listen.first|text.based|hands.on|written|aloud)\b[^.]{0,60}\b(works? better|goes better|better (for|with)|suits|settles?|lands better|more smoothly)\b/i;
    const reverse =
      /\b(settles? faster|goes better|works? better|more smoothly)\b[^.]{0,60}\b(audio|visual|listen.first|hands.on|aloud|hear it)\b/i;

    for (const [where, s] of candidates) {
      expect(s, `${where}: "${s}"`).not.toMatch(fit);
      expect(s, `${where}: "${s}"`).not.toMatch(reverse);
    }
  });

  it("guesses no pronoun and asserts no character", () => {
    // Nothing stores a pronoun and no field could make one right (frontend
    // section 6). "Not like him" and "uncharacteristic" are the same mistake
    // one step further on: they claim to know what the child is normally.
    const pronoun = /\b(she|her|hers|he|him|his)\b/i;
    const character = /\b(uncharacteristic|not like (her|him|them)|usual rhythm)\b/i;

    for (const [where, s] of candidates) {
      expect(s, `${where}: "${s}"`).not.toMatch(pronoun);
      expect(s, `${where}: "${s}"`).not.toMatch(character);
    }
  });
});
