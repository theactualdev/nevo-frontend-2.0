import { USER_ROLES, isAdminRole, type UserRole } from "@/lib/constants/permissions";

/**
 * Which console a sign-in door belongs to, and who may come through it.
 *
 * WHY THIS EXISTS. Every password door authenticated whoever could
 * authenticate anywhere and then pushed them at its own console: a teacher's
 * credentials were accepted at the admin door, the screen showed "You're in",
 * held, and pushed to an admin route - where `proxy.ts`'s role-cookie guard
 * bounced them back to sign-in. The guard held, so nothing leaked. But a door
 * that celebrates before it knows whether you belong there is a defect on its
 * own terms: to the person in front of it, a correct password produced a
 * broken login.
 *
 * ONE RULE, NOT TWO. `roleBelongsAt` is built from the SAME `isAdminRole` that
 * `proxy.ts` uses, deliberately. A door that re-states the guard's rule in its
 * own words is a second rule that can drift from the first, and the drift
 * would show up as exactly the bug above - refused in one place, admitted in
 * the other. If the guard's definition of an admin changes, both move together
 * or neither does.
 */
export type ConsoleDoor = "admin" | "teacher" | "student";

/**
 * The door a role may enter, or null for a role no door serves.
 *
 * `parent_guardian` is null ON PURPOSE and is not an oversight: parents never
 * sign in. They reach their pages through tokenised links, because putting a
 * login between a parent and a statutory entitlement is the thing D01b exists
 * to avoid. A parent account arriving at a password door is therefore a real
 * "nowhere to send you", not a routing gap to be filled in later.
 */
export function doorForRole(role: string | null | undefined): ConsoleDoor | null {
  if (isAdminRole(role)) return "admin";
  if (role === USER_ROLES.TEACHER) return "teacher";
  if (role === USER_ROLES.STUDENT) return "student";
  return null;
}

/** Whether this role belongs at this door. The check the doors were missing. */
export function roleBelongsAt(
  door: ConsoleDoor,
  role: string | null | undefined,
): boolean {
  return doorForRole(role) === door;
}

/** Where to send somebody who came to the wrong one. */
export const DOOR_HREF: Record<ConsoleDoor, string> = {
  admin: "/auth/admin",
  teacher: "/auth/teacher",
  student: "/auth/sign-in",
};

/** What to call it in a sentence, in the words the person would use. */
export const DOOR_LABEL: Record<ConsoleDoor, string> = {
  admin: "school admin",
  teacher: "teacher",
  student: "student",
};

/**
 * The role a door stores, narrowed - or null if the API sent something this
 * build has never heard of.
 *
 * The doors all wrote `session.role as UserRole`, which is a cast rather than
 * a check: an unrecognised role passed straight through into the session and
 * the role-mirror cookie, where `proxy.ts` would match none of its branches
 * and bounce the person from everywhere with no explanation anywhere.
 */
export function knownRole(role: string | null | undefined): UserRole | null {
  const values = Object.values(USER_ROLES) as string[];
  return typeof role === "string" && values.includes(role)
    ? (role as UserRole)
    : null;
}
