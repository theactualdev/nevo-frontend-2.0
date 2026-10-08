import { describe, expect, it } from "vitest";
import { OBSERVATION_COPY } from "@/lib/constants/observations";
import { TEACHER_CLASSES } from "./teacherClasses";
import { getStudentProfile, studentSlug } from "./teacherStudents";

/**
 * C08 IS NOT ALLOWED TO SAY HOW A CHILD LEARNS.
 *
 * The profile carried its own sentences with a confidence rating beside each -
 * "Prefers to hear an explanation before reading it herself" at "Clear
 * pattern". Three breaches of rule 1 in one card: a stored preference about a
 * named child, a modality claim, and a rating that turns an observation into a
 * finding. It was signed-out fixture copy, so no live teacher saw it, and it
 * was publicly reachable and it is the surface a prospective school is walked
 * through. It is very likely where "Halima is a text student" came from.
 *
 * Design ruled on 17 Sep that rule 1 wins, that the frame predated the
 * solution, and that C08 uses the sanctioned observation vocabulary from C16b
 * instead. These tests are the ruling, so the copy cannot drift back: a
 * fixture is exactly the kind of file somebody adds a "helpful" line to.
 *
 * Later the same day design ruled the `dimensions` CONCEPT out as well, not
 * just the sentences inside it, so the field these tests walk is
 * `observations` and it is typed on the closed enum. The checks are unchanged:
 * they were never about the container.
 */

// Every profile the screen can render: Amara's full one and the early state
// everyone else falls to. Read through the accessor so a new fixture is
// covered the moment it exists.
const profiles = TEACHER_CLASSES.flatMap((c) => c.roster)
  .map((s) => getStudentProfile(studentSlug(s.name)))
  .filter((p): p is NonNullable<typeof p> => p !== null);

/** Everything the screen says about a child, resolved through the vocabulary. */
const sentencesFor = (p: (typeof profiles)[number]) => [
  ...p.observations.map((d) => OBSERVATION_COPY[d].body(p.name.split(" ")[0]!)),
  ...p.observations.map((d) => OBSERVATION_COPY[d].title),
  p.noticing?.desktop ?? "",
  p.noticing?.tablet ?? "",
  p.earlyNote ?? "",
];

describe("what the student profile says about a child", () => {
  it("covers more than nothing", () => { expect(profiles.length).toBeGreaterThan(1); });
  it("names no modality, in any fixture", () => {
    // The words the meshing hypothesis is made of. A screen that names one of
    // these beside a child's name is asserting a learner type whatever the
    // surrounding sentence does.
    const modality =
      /\b(audio|visual|kinesthetic|auditory|hear it|listen first|read(ing)? it (first|herself|himself|themselves))\b/i;

    for (const p of profiles) {
      for (const s of sentencesFor(p)) {
        expect(s, `${p.name}: "${s}"`).not.toMatch(modality);
      }
    }
  });

  it("states no preference and rates no confidence", () => {
    // "Prefers" is the claim; "Clear pattern" is the rating that promoted it to
    // a finding. Neither belongs on a person.
    const banned = /\b(prefers|preference|learns best|clear pattern|emerging|early signal)\b/i;

    for (const p of profiles) {
      for (const s of sentencesFor(p)) {
        expect(s, `${p.name}: "${s}"`).not.toMatch(banned);
      }
    }
  });

  it("guesses no pronoun", () => {
    // Nothing stores one and no field could make it right (frontend section 6),
    // which is why the fixture's `pronoun` field was deleted on 17 Sep.
    for (const p of profiles) {
      for (const s of sentencesFor(p)) {
        expect(s, `${p.name}: "${s}"`).not.toMatch(/\b(she|her|hers|he|him|his)\b/i);
      }
    }
  });

  it("draws every observation from the sanctioned vocabulary", () => {
    // The point of routing through `OBSERVATION_COPY` is that this screen and
    // the roster chips cannot say different things about the same child. A
    // fixture writing its own sentence would reopen that.
    for (const p of profiles) {
      for (const d of p.observations) {
        expect(OBSERVATION_COPY[d], `${p.name}: ${d}`).toBeDefined();
      }
    }
  });
});

describe("the early profile's note (T128)", () => {
  it("opens with C08's own sentence, about the child's work", () => {
    const early = profiles.find((p) => p.earlyNote);
    const first = early!.name.split(" ")[0];

    expect(early!.earlyNote).toBe(
      `Still getting a picture of ${first}'s work. A few more sessions and this will fill in - for now, here's the early picture.`,
    );
  });
});
