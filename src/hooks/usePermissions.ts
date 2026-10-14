"use client";

import { useContext } from "react";
import { PermissionContext } from "@/context/PermissionContext";
import type { PermissionScope } from "@/lib/constants";

/** Admin permission-scope checks — Admin Layer only (FE Architecture §2 & §8). */
export function usePermissions() {
  const ctx = useContext(PermissionContext);
  if (ctx === undefined) {
    throw new Error("usePermissions must be used within <PermissionProvider>");
  }
  return {
    scopes: ctx.scopes,
    /** Senior or standard (13 Oct); null until known. */
    adminAccessLevel: ctx.adminAccessLevel ?? null,
    /** False until `permissions/me` has answered - scope-filtered UI waits. */
    resolved: ctx.resolved,
    /**
     * Why the list looks the way it does. `failed` is NOT "no scopes": a
     * screen must not tell an admin they have no access because a read broke.
     */
    status: ctx.status,
    /** Ask again after a failure. */
    refresh: ctx.refresh,
    hasScope: (scope: PermissionScope) => ctx.scopes.includes(scope),
  };
}
