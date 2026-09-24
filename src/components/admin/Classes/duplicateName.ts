import type { AdminClass } from "@/lib/api/classes";
import { yearGroupLabel } from "@/lib/constants/yearGroups";

/**
 * Whether a proposed class name already exists in this school.
 *
 * SCRUM-149 CL-03 asks for duplicate detection *before* submit, "matching
 * case-insensitively and ignoring surrounding whitespace", with a message that
 * names the class it collides with. The single-create sheet had none, so a
 * school could make "JSS 2A" twice and only discover it on the roster.
 *
 * IT MATTERS MORE IN BULK THAN SINGLY. CL-04 composes up to a few dozen names
 * at once from a year group and a set of sections, and a school setting up in
 * September has usually already typed a handful by hand. Without this, the
 * bulk sheet's whole purpose - not doing this thirty times - would hand back
 * thirty rows of which four are rejections the admin could have been shown
 * before pressing anything.
 *
 * ARCHIVED CLASSES COUNT. Archive is reversible and never deletes, so an
 * archived "JSS 2A" is still a class this school has; creating a second one
 * would leave two that differ only by a state the list hides by default. The
 * caller decides how to say that - see `collisionNote` - but the match itself
 * does not pretend the name is free.
 */

/** The comparison the rule describes: trimmed, case-folded, spaces collapsed. */
export function normaliseClassName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * The existing class a proposed name collides with, or null.
 *
 * Returns the CLASS rather than a boolean so the message can name it, which is
 * what CL-03 asks for — "JSS 2A already exists" is actionable in a way that
 * "that name is taken" is not.
 */
export function findCollision(
  name: string,
  existing: readonly AdminClass[],
): AdminClass | null {
  const wanted = normaliseClassName(name);
  if (!wanted) return null;
  return existing.find((c) => normaliseClassName(c.name) === wanted) ?? null;
}

/**
 * What to tell the admin about a collision. Archived is a different sentence
 * because the remedy is different: restore it rather than rename.
 */
export function collisionNote(collided: AdminClass): string {
  /*
   * NAMES THE YEAR GROUP, which our first version did not. D05's own wording:
   * *"This matches JSS 2A, which already exists in Year 8. Rename this one, or
   * open the existing class instead."* We said only "JSS 2A already exists."
   *
   * The year group is the half that makes it actionable. A school running
   * JSS 2A in two different years - which happens across a curriculum change -
   * reads "JSS 2A already exists" as Nevo being wrong, and reads "already
   * exists in Year 8" as information.
   *
   * Absent when the collided class has no year group, rather than "in null":
   * `yearGroup` is nullable and a roster import can produce one.
   */
  const where = collided.yearGroup
    ? ` in ${yearGroupLabel(collided.yearGroup) ?? collided.yearGroup}`
    : "";
  return collided.archivedAt
    ? `${collided.name} already exists${where} but is archived. Restore it instead of creating a second one.`
    : `This matches ${collided.name}, which already exists${where}. Rename this one, or open the existing class instead.`;
}
