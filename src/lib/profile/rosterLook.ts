import {
  DEFAULT_AVATAR_LOOK,
  avatarLook,
  avatarLookOf,
  isAvatarColourway,
  isAvatarShape,
  type AvatarLook,
} from "./avatarLook";

/**
 * A child's avatar fields as the roster reads send them
 * (`StudentSummaryResponse` on `GET /students`, `ClassStudentResponse` on a
 * class's students). Each is nullable; none of them is on the single-student
 * read (`StudentDetailResponse`), which is why a record page reads its look
 * from the child's class roster.
 */
export interface AvatarFields {
  avatarTone?: string | null;
  avatarShape?: string | null;
  avatarColourway?: string | null;
}

/**
 * The look a staff screen draws for a child, from a roster row - through the
 * ONE definition in `avatarLook` (SCRUM-324), never initials.
 *
 * INTERIM, and in this order (hub, 7 Nov):
 *  1. `avatarTone` when it holds a look the child chose - "<shape>-<colourway>",
 *     where the child's own write keeps it until users/me and `ProfilePatch`
 *     carry the shape (asked of Teslim);
 *  2. otherwise the server's `avatarShape` + `avatarColourway`;
 *  3. otherwise the nothing-chosen look, the navy circle every frame draws for
 *     a child who hasn't chosen (rule 5 - not one picked for them).
 * Once the child's write carries the shape, step 1 goes.
 */
export function lookOfChild(row: AvatarFields): AvatarLook {
  const kept = avatarLook(row.avatarTone);
  if (typeof row.avatarTone === "string" && kept.id === row.avatarTone) return kept;
  if (isAvatarShape(row.avatarShape) && isAvatarColourway(row.avatarColourway)) {
    return avatarLookOf(row.avatarShape, row.avatarColourway);
  }
  return DEFAULT_AVATAR_LOOK;
}
