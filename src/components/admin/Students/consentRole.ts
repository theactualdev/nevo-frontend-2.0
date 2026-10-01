"use client";

import { useContext } from "react";
import { PermissionContext } from "@/context/PermissionContext";

/**
 * Who may send a parent the consent request.
 *
 * `POST /api/v1/students/{id}/parent-consent-requests` (and `GET
 * /parent-links`) take ROSTER OR SENCO access - backend, 1 Oct. It was
 * SENCo-only until then, and a new school was locked out of its own first
 * task: the founding admin is created with every scope EXCEPT senco, on
 * purpose, so the one scope withheld was the one consent needed. Roster is
 * the right altitude; it already covers classes, students and the team.
 *
 * (`POST /consents/school-confirmations` stays SENCo-only - that is a school
 * asserting consent on a parent's behalf - and nothing here uses it.)
 *
 * Read from the admin's scopes, so it agrees with what the server checks.
 * Nothing is offered until the scopes have loaded.
 */
export function useMaySendConsent(): boolean {
  // The context, not `usePermissions`: that throws outside its provider, and a
  // screen with no permissions to read knows nothing about this admin - so it
  // offers nothing rather than failing to render.
  const ctx = useContext(PermissionContext);
  return Boolean(
    ctx?.resolved && (ctx.scopes.includes("roster") || ctx.scopes.includes("senco")),
  );
}

/** What an admin who cannot send is told, wherever the button would have been. */
export const CANNOT_SEND_LINE =
  "Consent requests are sent by an admin with roster or SENCo / Learning Support access.";
