import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ADJUSTMENT_ACTIONS } from "./affect";
import { densityForAction } from "@/lib/lessons/densityForAction";

/**
 * THE CODE MUST NOT SPEAK A VOCABULARY THE PRODUCT DOES NOT HAVE.
 *
 * There was an `AFFECTIVE_STATES` map and three components named off it -
 * `FrustrationHint`, `BoredomOfferPill`, `ConfusionSupport`. Frontend §4 is
 * explicit that the frontend receives an instruction and never decides which
 * state is active, so the names said out loud that this app reasons about
 * states. Only the authored demo ever reached them, so nothing was wrong on a
 * child's screen; the cost was that the next person to read the player learned
 * the wrong model of the system from the identifiers.
 *
 * Design's ruling on 17 Sep was that this is not cosmetic: "Code named for
 * states teaches the next person that the frontend reasons about states, and
 * that is the exact drift we have hit four times." So this is a lint with a
 * reason rather than a style rule - a state name is how the drift comes back,
 * and a fixture or a demo is exactly where somebody reintroduces one.
 */

const ROOT = join(import.meta.dirname, "..", "..");

/** Every place an instruction is authored, chosen, or rendered. */
const FILES = [
  "lib/constants/affect.ts",
  "lib/types/lesson.ts",
  "lib/lessons/adaptation.ts",
  "lib/mocks/photosynthesis.ts",
  "lib/mocks/adding-fractions.ts",
  "components/student/Lesson/LessonPlayer.tsx",
  "components/student/Lesson/AffectiveLayer.tsx",
  "components/student/Lesson/BreakOfferPill.tsx",
];

const read = (f: string) => readFileSync(join(ROOT, f), "utf8");

/**
 * Comments may discuss the words - the two docblocks recording WHY they went
 * are worth more than the purity of this check, and a future reader who does
 * not know the history is the person who reintroduces them.
 */
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

describe("the affective vocabulary this codebase is allowed", () => {
  it("names no affective state in any code path", () => {
    // The four the engine infers and §4 forbids us knowing. Word-bounded, so
    // `no_action` and `modulate_density` are untouched.
    const states = /\b(anxiety|anxious|boredom|bored|frustration|frustrated|confusion|confused)\b/i;

    for (const f of FILES) {
      const found = code(read(f)).match(states);
      expect(found?.[0], `${f} names the state "${found?.[0]}"`).toBeUndefined();
    }
  });

  it("carries the contract's five, and nothing invented", () => {
    /*
     * THE AUTHORITY CHANGED ON 23 SEP, THE RULE DID NOT.
     *
     * This used to pin "the six actions section 4 names". `action` was a bare
     * string then; it now `$ref`s `ProactiveAction`, and design ruled the same
     * day that **the engine's published vocabulary IS the contract** - design
     * and frontend conform to it, and where design needs an instruction that
     * does not exist it is raised as a request rather than built against a
     * guessed name.
     *
     * So the closed-set guard stays exactly as strict. What it is closed
     * AROUND is now the enum plus a named, reasoned holdover list - and a
     * value in neither still fails, which is the whole point.
     */
    const CONTRACT = [
      "expand",
      "offer_hint",
      "show_socratic_panel",
      "simplify",
      "slower",
    ];

    /*
     * Held on design's explicit instruction of 23 Sep - *"do not declare it
     * dead yet"* - pending their answer on whether density dropping has a
     * channel at all. `no_action` is ours rather than the engine's: the
     * absence of an instruction is a state the player reasons about.
     * `offer_break` is correctly absent from the enum, because a break is not
     * an adaptation instruction and has its own signal on `breakSuggestion`.
     */
    const HELD = [
      "increase_difficulty",
      "modulate_density",
      "no_action",
      "offer_break",
    ];

    expect(Object.values(ADJUSTMENT_ACTIONS).sort()).toEqual(
      [...CONTRACT, ...HELD].sort(),
    );
  });

  it("maps every pace instruction the contract sends, and only those", () => {
    /*
     * The join design asked for - one path, two callers - seen from the
     * vocabulary's side. Three of the contract's five are densities; the other
     * two are instructions about the same screen and must not become one.
     *
     * `modulate_density` is the one to watch: the NAME says density, it is
     * held rather than deleted, and folding it in here would quietly turn a
     * dim of secondary chrome into a reshape of the child's text.
     */
    const densities = Object.values(ADJUSTMENT_ACTIONS)
      .filter((a) => densityForAction(a) !== null)
      .sort();

    expect(densities).toEqual(["expand", "simplify", "slower"]);
  });

  it("still records why the state words went", () => {
    // The inverse guard. If a later tidy-up deletes the history, the next
    // person to reach for `affect: "frustration"` has nothing telling them not
    // to - and this whole check becomes an unexplained rule.
    expect(read("lib/constants/affect.ts")).toContain("AFFECTIVE_STATES");
    expect(read("components/student/Lesson/AffectiveLayer.tsx")).toContain(
      "FrustrationHint",
    );
  });
});
