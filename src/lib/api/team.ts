import type { PermissionScope, UserRole } from "@/lib/constants/permissions";
import { api } from "./client";

/**
 * School team endpoints (`/api/v1/admin/team/*`), typed against the deployed
 * backend. The whole surface is live: list, invite, accept, and change scopes.
 *
 * Invitation acceptance is unauthenticated by design - the invitation token is
 * the credential and the invitee has no session yet. Note what its response
 * does NOT carry: no access token, so accepting activates the account without
 * signing anyone in, and no email, which is why the invite link has to carry
 * one.
 */

export interface TeamMember {
  userId: string;
  adminId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string;
  status: string;
  scopes: PermissionScope[];
}

export interface InviteTeamMemberRequest {
  email: string;
  role: UserRole;
  scopes: PermissionScope[];
}

export interface InvitedTeamMember {
  invitationId: string;
  userId: string;
  email: string;
  role: string;
  scopes: PermissionScope[];
  /** What the activation link carries as `?token=`. */
  invitationToken: string;
  expiresAt: string;
}

export interface AcceptInvitationRequest {
  invitationToken: string;
  password: string;
}

export interface AcceptInvitationResponse {
  userId: string;
  schoolId: string;
  role: string;
}

/**
 * D03's invite panel asks only which scopes a person gets - there is no role
 * picker anywhere in the frame - but the API requires a role. SENCo is the one
 * scope the enum names on its own, so it decides; everything else is an
 * ordinary admin.
 *
 * TODO(api): confirm this is the intended derivation, or give the invite
 * endpoint a default so the client does not have to guess.
 */
export function roleForScopes(scopes: PermissionScope[]): UserRole {
  return scopes.includes("senco") ? "senco_admin" : "other_admin";
}

/**
 * Where an invited admin sets their password.
 *
 * `/auth/admin/activate` rather than the teacher's route: `SetPasswordForm`
 * has been live against `POST /admin/team/invitations/accept` all along, but
 * only reachable at a URL reading "teacher", which is not an address to send a
 * proprietor's new deputy head.
 *
 * NO EMAIL IN THE LINK. It used to ride along so the form could sign the new
 * admin straight in after activating (the accept response carries no
 * address) - but a link is pasted into chats, forwarded and logged, and the
 * address went everywhere it did. Without it the form already does the right
 * thing: it activates, then sends them to the sign-in door.
 */
export function adminActivationLink(invited: InvitedTeamMember): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/auth/admin/activate?token=${encodeURIComponent(invited.invitationToken)}`;
}

export const teamApi = {
  /** GET /api/v1/admin/team - everyone who can administer the school. */
  list: () => api.get<TeamMember[]>("/api/v1/admin/team"),

  /** POST /api/v1/admin/team/invitations - returns the activation token. */
  invite: (payload: InviteTeamMemberRequest) =>
    api.post<InvitedTeamMember>("/api/v1/admin/team/invitations", payload),

  /** POST /api/v1/admin/team/invitations/accept - activates the account. */
  acceptInvitation: (payload: AcceptInvitationRequest) =>
    api.post<AcceptInvitationResponse>(
      "/api/v1/admin/team/invitations/accept",
      payload,
    ),

  /** PUT /api/v1/admin/team/{id}/scopes - D03 draws no UI for this yet. */
  updateScopes: (targetUserId: string, scopes: PermissionScope[]) =>
    api.put<TeamMember>(`/api/v1/admin/team/${targetUserId}/scopes`, {
      scopes,
    }),
};
