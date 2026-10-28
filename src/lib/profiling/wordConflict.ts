/**
 * WORD CONFLICT (2C), the senior band's conflict task: the word says LEFT or
 * RIGHT, an arrow under it points with it or against it, and the child taps
 * what the WORD says (design 534ba31, `Nevo Word Conflict Frame`: "Tap what
 * the word says, not the way the arrow points"). Lydia approved it on 26 Oct
 * in place of a colour Stroop the four-colour system cannot draw, and gave the
 * trial list on 27 Oct:
 *
 *   "Eight practice trials with feedback, then thirty-two scored trials. Half
 *   congruent, half incongruent. LEFT and RIGHT balanced inside each half, so
 *   eight of each of the four combinations. Order randomised with no more
 *   than three of the same correct response in a row."
 *
 * "The word says RIGHT as often as LEFT, otherwise a child learns one rule and
 * we measure the rule rather than their inhibition."
 *
 * THE DEVICE SCORES NOTHING (rule 3). What goes up is each trial as it
 * happened - dimension `inhibition`, its condition, the word tapped, whether
 * it matched the word, the time - and the engine takes accuracy and the
 * congruent/incongruent gap from that (Teslim 4c5706a). This only builds the
 * list: the order is random, which is a property of the task, not a reading
 * of the child.
 */

export type WordDirection = "left" | "right";

export interface WordConflictTrial {
  /** What the word says, and so the right answer. */
  word: WordDirection;
  /** Which way the arrow under it points. */
  arrow: WordDirection;
  condition: "congruent" | "incongruent";
  /** One of the eight practice trials before the thirty-two. */
  practice: boolean;
}

/** Lydia, 27 Oct: eight practice trials, then thirty-two scored. */
export const PRACTICE_TRIALS = 8;
export const SCORED_TRIALS = 32;
/** "No more than three of the same correct response in a row." */
export const MAX_RUN = 3;

const other = (d: WordDirection): WordDirection =>
  d === "left" ? "right" : "left";

/** `perHalf` of each word in each condition: the four combinations, balanced. */
function balanced(perCombination: number, practice: boolean) {
  const trials: WordConflictTrial[] = [];
  for (const condition of ["congruent", "incongruent"] as const) {
    for (const word of ["left", "right"] as const) {
      for (let i = 0; i < perCombination; i++) {
        trials.push({
          word,
          arrow: condition === "congruent" ? word : other(word),
          condition,
          practice,
        });
      }
    }
  }
  return trials;
}

/** Whether no correct response runs longer than `MAX_RUN`. */
export function runsHold(trials: readonly WordConflictTrial[]): boolean {
  let run = 0;
  for (let i = 0; i < trials.length; i++) {
    run = i > 0 && trials[i].word === trials[i - 1].word ? run + 1 : 1;
    if (run > MAX_RUN) return false;
  }
  return true;
}

/** `trials` in a random order (Fisher-Yates). */
function shuffled(
  trials: readonly WordConflictTrial[],
  random: () => number,
): WordConflictTrial[] {
  const deck = [...trials];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** The words taking turns, LEFT first: an order that always holds. */
function alternated(trials: readonly WordConflictTrial[]): WordConflictTrial[] {
  const lefts = trials.filter((t) => t.word === "left");
  const rights = trials.filter((t) => t.word === "right");
  return lefts.flatMap((t, i) => (rights[i] ? [t, rights[i]] : [t]));
}

/**
 * One run's trials: the eight practice (two of each combination - Lydia gave
 * their number, not their mix, so they are balanced the same way), then the
 * thirty-two scored (eight of each), each block in its own random order,
 * drawn again until no word comes more than three times in a row, across the
 * join too. With the words balanced about one draw in ten holds, so the cap
 * is a guard: past it - a broken `random` - the words simply take turns.
 */
export function wordConflictTrials(
  random: () => number = Math.random,
): WordConflictTrial[] {
  const practice = balanced(PRACTICE_TRIALS / 4, true);
  const scored = balanced(SCORED_TRIALS / 4, false);
  for (let attempt = 0; attempt < 1000; attempt++) {
    const all = [...shuffled(practice, random), ...shuffled(scored, random)];
    if (runsHold(all)) return all;
  }
  return [...alternated(practice), ...alternated(scored)];
}
