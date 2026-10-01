"use client";

import { useState } from "react";
import { getSession } from "@/lib/auth/session";

/**
 * Who may send a parent the consent request.
 *
 * `POST /api/v1/students/{id}/parent-consent-requests` is SENCO-ADMIN ONLY
 * (backend: `SencoDependency`), and backend's instruction is explicit: "Check
 * the role before you draw the button." Every request control in this console
 * was drawn for every admin, so an admin without SENCo access pressed "Send
 * request" and met a refusal for something the screen had offered them.
 *
 * The ROLE, not a scope: the dependency checks the role, and an admin's role
 * follows their scopes (`roleForScopes` - holding SENCo / Learning Support
 * makes an admin `senco_admin`). Read once, from the session, like the rest of
 * the console's own-identity checks.
 */
export function useMaySendConsent(): boolean {
  const [may] = useState(() => getSession()?.role === "senco_admin");
  return may;
}

/** What an admin who cannot send is told, wherever the button would have been. */
export const SENCO_SENDS_LINE =
  "Consent requests are sent by an admin with SENCo / Learning Support access.";
