/**
 * Is the child's entry one of the answers the pipeline stored for a step?
 *
 * MATCHED, NEVER WORKED OUT. Lydia on SCRUM-177: judging does not happen at
 * runtime. When the pipeline reads a lesson it writes down every acceptable
 * form of each step - the step's `answer`, its `targets`, the options they
 * name - and the child's entry is compared with that list. So nothing here
 * evaluates anything: "0.75" is not "3/4" unless the pipeline stored both, and
 * "1 + x" is not "x + 1" unless it stored both.
 *
 * SPACING IS THE ONE THING IGNORED, because it is never part of what is
 * written: "3x - 4" and "3x-4" are the same answer set down twice. Letter case
 * is NOT ignored any more. It was, for algebra, but a stored list is the rule
 * now and case can be the whole answer elsewhere - "Co" is not "CO" - so a
 * form the pipeline meant to accept is one it stores.
 */
export function isStoredAnswer(
  entry: string,
  accepted: readonly string[],
): boolean {
  const typed = written(entry);
  return typed !== "" && accepted.some((answer) => written(answer) === typed);
}

const written = (s: string) => s.replace(/\s+/g, "");
