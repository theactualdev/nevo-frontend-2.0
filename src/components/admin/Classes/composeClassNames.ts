import type { AdminClass } from "@/lib/api/classes";
import { yearGroupLabel, yearGroupOptions } from "@/lib/constants/yearGroups";
import { collisionNote, findCollision } from "./duplicateName";

/**
 * SCRUM-149 CL-04: *"Pick a year group, tick the sections, Nevo composes the
 * names."* This is the composing.
 *
 * THE NAME IS THE SCHOOL'S LABEL PLUS THE SECTION, and nothing else. A school
 * whose year group renders as "JSS 2" and who ticks A, B and C gets "JSS 2A",
 * "JSS 2B", "JSS 2C" — which is what those classes are actually called in the
 * building. The label comes from `yearGroupLabel`, which reads the school's own
 * `academicConfig.yearGroupLabels`, so a school using "Year 8" gets "Year 8A"
 * without anyone configuring this screen.
 *
 * NO SEPARATOR, DELIBERATELY. "JSS 2 A" and "JSS 2-A" are both plausible and
 * both wrong for Nigerian secondary schools, where the section is written flush
 * against the year. The preview shows every composed name before anything is
 * sent, so a school that writes them differently can see that immediately and
 * fall back to creating them one at a time rather than being given thirty names
 * in a format they do not use.
 *
 * COLLISIONS ARE COMPUTED HERE, NOT AFTER THE POST. The endpoint reports
 * rejections per row, but a class that already exists is knowable before
 * pressing anything, and CL-04's preview is where the admin decides. Letting
 * the server reject them would turn a preview of twelve into a result of eight
 * plus four failures the screen could have prevented.
 */

export interface ComposedClass {
  /** The section as ticked — "A", "B". */
  section: string;
  /** What the class will be called. */
  name: string;
  /** Set when this name already exists; the row is excluded from the send. */
  collision: string | null;
}

/** A, B, C … the sections a Nigerian secondary school actually uses. */
export const SECTION_CHOICES = "ABCDEFGH".split("");

export function composeClassNames({
  yearGroup,
  sections,
  existing,
}: {
  yearGroup: string;
  sections: readonly string[];
  existing: readonly AdminClass[];
}): ComposedClass[] {
  /*
   * THE YEAR GROUP MUST BE ONE THE SCHOOL ACTUALLY HAS, and `yearGroupLabel`
   * alone does not tell you that: for an unrecognised value it returns the
   * RAW VALUE rather than null (`yearGroups.ts:127`). A first draft guarded on
   * `if (!label)` and would therefore have composed "not-a-yearA" — a class in
   * the building called something nobody there says, which is the exact thing
   * the guard was written to prevent. A test caught it.
   *
   * So membership is checked against the school's own option list, which is
   * also what the select offers.
   */
  const known = yearGroupOptions().some((o) => o.value === yearGroup);
  const label = known ? yearGroupLabel(yearGroup) : null;
  if (!label) return [];

  return sections.map((section) => {
    const name = `${label}${section}`;
    const collided = findCollision(name, existing);
    return {
      section,
      name,
      collision: collided ? collisionNote(collided) : null,
    };
  });
}

/** What will actually be sent: everything that does not already exist. */
export function sendable(composed: readonly ComposedClass[]): ComposedClass[] {
  return composed.filter((c) => !c.collision);
}
