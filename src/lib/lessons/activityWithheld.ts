import type { ActivityAvailability } from "@/lib/api/lessons";

/**
 * What a teacher is told when the server says a section's activity is
 * withheld from children (SCRUM-290). The ticket gives the substance - it is
 * "currently withheld from children", it does not blame the teacher, it is not
 * an error, it is calm "because nothing has gone wrong with their lesson", and
 * it clears on its own. The words are ours, in copy-for-lydia.md.
 */

/**
 * The server says this section's activity is withheld from children now.
 * Here rather than beside the type, so a test that mocks the API module
 * does not lose it.
 */
export function activityWithheld(segment: {
  activityAvailability?: ActivityAvailability | null;
}): boolean {
  return segment.activityAvailability?.reachableByStudents === false;
}

/** Beside the section on the lesson page, where space is one line. */
export const WITHHELD_ROW = "Its activity is held back from children for now.";

/** Over the activity itself, in the variant review. */
export function withheldDetail(availability: ActivityAvailability): string {
  const why =
    availability.reason === "safety_instruction_not_rendered"
      ? " Nevo holds it back until its safety line can be shown with it."
      : "";
  return `Children can’t open this activity at the moment.${why} It comes back on its own, and there’s nothing you need to do.`;
}
