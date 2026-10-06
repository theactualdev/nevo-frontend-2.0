"use client";

import { useContext } from "react";
import { PermissionContext } from "@/context/PermissionContext";
import { adminHomeForScopes, canOpen } from "./adminNav";

/**
 * `canOpen` for the admin signed in now.
 *
 * OPEN UNTIL PERMISSIONS HAVE ANSWERED. A link hidden on every cold load is a
 * worse fault than one that may, rarely, lead to a refusal - and the refusal
 * says what it is and offers the way back (`NoAccess`). A FAILED read counts
 * as unanswered too: the context reports it as resolved with no scopes, and
 * reading that as "holds nothing" would strip every link from a proprietor
 * because one GET blipped.
 *
 * Read through the context rather than `usePermissions`, which throws outside
 * its provider: a screen rendered in isolation keeps every link.
 */
export function useCanOpen(): (href: string) => boolean {
  const ctx = useContext(PermissionContext);
  return (href) => ctx?.status !== "ready" || canOpen(href, ctx.scopes);
}

/** Where this admin's console begins, once permissions have answered. */
export function useAdminHome(): string | null {
  const ctx = useContext(PermissionContext);
  return ctx?.status === "ready" ? adminHomeForScopes(ctx.scopes) : null;
}
