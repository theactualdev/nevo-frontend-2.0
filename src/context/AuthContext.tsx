"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ApiError, authApi } from "@/lib/api";
import { clearSession, getSession } from "@/lib/auth/session";
import type { UserRole } from "@/lib/constants";
import {
  endEphemeralSession,
  setEphemeralStudent,
} from "@/lib/signals/ephemeralStore";

/** The authenticated user (Product Arch A.1–A.2). */
export interface AuthUser {
  id: string;
  role: UserRole;
  schoolId: string;
  name?: string;
  /**
   * How the student authenticated. Drives onboarding conditional branching:
   * SSO students skip Steps 1–3 (name/school/class) and enter the sequence
   * directly (Product Arch B.2). Populated from the session once auth lands.
   */
  method?: "sso" | "manual";
}

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  /**
   * Establish a client session. Real auth will hydrate this from the FastAPI
   * session (see proxy.ts); today it's called by the SSO callback once the
   * identity provider returns, so onboarding reads `user.method` from the
   * session rather than a spoofable `?path=sso` query param.
   */
  signIn: (user: AuthUser) => void;
  /** End the client session (Sign Out Modal). TODO(auth): revoke server-side. */
  signOut: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  // Hydrate from the live backend: a stored Bearer token is validated against
  // GET /auth/session on mount; a rejected/expired token clears quietly.
  useEffect(() => {
    let cancelled = false;
    // Sync from the external session store + backend session endpoint.
    const hydrate = () => {
      const stored = getSession();
      if (!stored) {
        setStatus("unauthenticated");
        return;
      }
      authApi
        .session()
        .then((s) => {
          if (cancelled) return;
          // TODO(api): session carries no school id yet - flagged to backend.
          // `method` is the device's record of the door, which the server's
          // session does not carry: without it a reload put an SSO child on
          // the manual onboarding path.
          setUser({
            id: s.userId,
            role: s.role as UserRole,
            schoolId: "",
            method: stored.method,
          });
          setStatus("authenticated");
          setEphemeralStudent(s.userId);
        })
        .catch((cause: unknown) => {
          if (cancelled) return;
          /*
           * ONLY THE SERVER CAN SAY A SESSION IS DEAD.
           *
           * This cleared the token on ANY failure - a 500, a timeout, a cold
           * backend, a classroom 3G blip. So a child who opened Nevo on a bad
           * signal was signed out before they saw anything, and the PIN screen
           * they landed on needs the network too, so they got "we couldn't
           * check that just now" instead of their lessons. Nothing about their
           * session was wrong.
           *
           * A 401 or 403 is the server saying this token is no longer good, and
           * that is worth acting on. Anything else means WE DO NOT KNOW - so
           * keep the session we have. It carries its own expiry and clears
           * itself when that passes, and any real request will 401 into
           * `handleAuthFailure`, which sends them to the right door.
           *
           * Erring this way costs an unreachable child one failed read. Erring
           * the other way costs them their session for no reason at all.
           */
          const status = cause instanceof ApiError ? cause.status : 0;
          if (status === 401 || status === 403) {
            clearSession();
            setStatus("unauthenticated");
            return;
          }
          const stillStored = getSession();
          if (!stillStored) {
            setStatus("unauthenticated");
            return;
          }
          setUser({
            id: stillStored.userId,
            role: stillStored.role as UserRole,
            schoolId: "",
            method: stillStored.method,
          });
          setStatus("authenticated");
          setEphemeralStudent(stillStored.userId);
        });
    };
    hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback((next: AuthUser) => {
    setUser(next);
    setStatus("authenticated");
    // Ephemeral behavioural signals are tagged per student, on-device only.
    setEphemeralStudent(next.id);
  }, []);
  const signOut = useCallback(() => {
    // Server-side revoke is best-effort; the local session always clears.
    void authApi.logout().catch(() => {});
    setUser(null);
    setStatus("unauthenticated");
    // NDPA ephemerality (SCRUM-76): sign-out purges the on-device
    // behavioural-signal store and retires its session id.
    void endEphemeralSession();
  }, []);
  const value = useMemo<AuthContextValue>(
    () => ({ user, status, signIn, signOut }),
    [user, status, signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
