import { api } from "./client";
import type { PermissionScope } from "@/lib/constants";

/**
 * Permission endpoints, typed against the deployed backend (openapi 2.0.0).
 * The scope strings mirror the backend PermissionScope enum exactly - see
 * src/lib/constants/permissions.ts.
 */

/**
 * The small v1 distinction between administrators (backend, 13 Oct): a school's
 * founder is senior, an invited admin standard. Only a senior administrator
 * changes school settings (`PATCH /school` answers 403 `senior_admin_required`
 * to anyone else).
 */
export type AdminAccessLevel = "senior" | "standard";

export const SENIOR_ADMIN_REQUIRED = "senior_admin_required";

export interface PermissionsMe {
  userId: string;
  schoolId: string | null;
  role: string;
  scopes: PermissionScope[];
  /** Nav items the backend says this admin should see (D.3 dynamic nav). */
  navigation: string[];
  /** Null for anyone who is not an admin; absent on an older answer. */
  adminAccessLevel?: AdminAccessLevel | null;
}

export const permissionsApi = {
  /** The signed-in user's role + scopes. GET /api/v1/permissions/me */
  me: () => api.get<PermissionsMe>("/api/v1/permissions/me"),
};
