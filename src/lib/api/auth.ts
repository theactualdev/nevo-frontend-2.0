import { api } from "./client";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * Auth endpoints - wired to the live FastAPI contract (Bearer tokens).
 *
 * Both logins return an access token which is stored client-side and attached
 * to every subsequent request by the api client. `logout` clears the local
 * session even if the server call fails - the device must always be able to
 * sign out.
 */

/** 200 body of both login endpoints. */
export interface LoginResponse {
  accessToken: string;
  tokenType: string;
  expiresAt: string;
  userId: string;
  role: string;
  replacedSession: boolean;
}

/**
 * `SsoCallbackResponse.destination` - REQUIRED, and an enum, not a route: the
 * server's answer to whether this is the child's first use. Typed as an
 * optional string, it was routed to as if it were a path. See `ssoLanding`.
 */
export type SsoFirstUseDestination = "observed_interaction" | "home_dashboard";

/** GET /auth/session - the authenticated principal. */
export interface SessionInfo {
  userId: string;
  role: string;
  sessionId: string;
}

function store(login: LoginResponse): LoginResponse {
  setSession({
    token: login.accessToken,
    expiresAt: login.expiresAt,
    userId: login.userId,
    role: login.role,
  });
  return login;
}

/** One open sign-in. No IP address and no device name in the contract. */
export interface AuthSession {
  id: string;
  /** True for the session making the request. */
  current: boolean;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  active: boolean;
}

export const authApi = {
  /**
   * Store the chosen PIN for a child who is ALREADY signed in - the SSO path,
   * and changing a PIN from the profile screen.
   *
   * A child setting a FIRST PIN before any session exists is not this call:
   * see `bindFirstPin`, which uses `POST /student-entry/pin` (B64).
   */
  setPin: (pin: string, currentPin?: string) =>
    api.post<Record<string, string>>("/api/v1/auth/pin", {
      pin,
      /*
       * REQUIRED WHEN THE ACCOUNT ALREADY HAS A PIN, as of 23 Sep, and
       * enforced: a wrong or missing one is a 403 `current_pin_required`.
       *
       * Omitted rather than sent as undefined-shaped null, because the two
       * callers of this route are genuinely different requests. Setting a
       * FIRST PIN - the SSO path - has nothing to prove and sends none;
       * changing an existing one must. A null here would be us asserting
       * "there is no current PIN" about an account that has one.
       *
       * This is the field frame 27 has drawn since the beginning ("Enter your
       * current PIN", step 1 of 3) and that had nowhere to go until now. It
       * was list S-B 9.
       */
      ...(currentPin ? { currentPin } : {}),
    }),

  /**
   * PUBLIC. A child who forgot their PIN asks for it to be cleared - 00a's
   * "Let my teacher know" (design, D3: SCRUM-216/217).
   *
   * A REQUEST, NOT A RESET. It answers 202 with nothing about the account and
   * no PIN; the adult already linked to the child clears it, and the child
   * then sets a new one themselves. Nobody but the child ever sets a PIN.
   * The two fields are the pair a remembered device already holds.
   */
  requestPinReset: (payload: { schoolCode: string; loginIdentifier: string }) =>
    api.post<Record<string, string>>("/api/v1/auth/pin/reset", payload),

  /**
   * Change your own password (D12c).
   *
   * `endOtherSessions` is what makes the screen's promise true - "changing
   * this signs you out everywhere else. You'll stay signed in here." - so it
   * is sent as `true`, not left to the server's default.
   */
  changePassword: (payload: {
    currentPassword: string;
    newPassword: string;
    endOtherSessions?: boolean;
  }) => api.post<void>("/api/v1/auth/password/change", payload),

  /**
   * Every session this account has open (D12c "Where you're signed in").
   *
   * Carries NO IP ADDRESS and no device name, which is half a happy accident:
   * D12c is explicit that no IP addresses appear anywhere on this screen, and
   * the contract cannot leak one because it does not have one. The missing
   * device label is the unhappy half - see `AccountSettings`.
   */
  sessions: () => api.get<AuthSession[]>("/api/v1/auth/sessions"),

  /** End one session. */
  endSession: (sessionId: string) =>
    api.del<void>(`/api/v1/auth/sessions/${sessionId}`),

  /** End every session except this one. */
  endOtherSessions: () =>
    api.post<void>("/api/v1/auth/sessions/revoke-others"),

  /** Staff sign-in (teacher/admin) - email + password. */
  loginPassword: (payload: { email: string; password: string }) =>
    api
      .post<LoginResponse>("/api/v1/auth/login/password", payload)
      .then(store),

  /** Student sign-in - school code + identifier from the remembered device
   *  profile, plus the PIN they just entered (frame 00). */
  loginPin: (payload: {
    schoolCode: string;
    loginIdentifier: string;
    pin: string;
  }) => api.post<LoginResponse>("/api/v1/auth/login/pin", payload).then(store),

  /** Resolve the current session (requires a stored token). */
  session: () => api.get<SessionInfo>("/api/v1/auth/session"),

  /**
   * Trade a LIVE token for a fresh one (7 Sep). Takes no body; the session it
   * renews is the one the Bearer header names.
   *
   * BEARER, WHICH DECIDES HOW THIS MUST BE USED. It cannot resurrect a dead
   * session - by the time a request 401s, or `getSession()` has cleared itself
   * past `expiresAt`, there is no token left to present and this would 401
   * too. So it has to run BEFORE expiry, on a timer, not from a failure
   * handler. See `useSessionRefresh`.
   *
   * The response is the login shape, so it goes through the same `store()`:
   * one place writes a session, and the role cookie the route guard reads is
   * rewritten with the new expiry as a consequence.
   */
  refresh: () =>
    api.post<LoginResponse>("/api/v1/auth/session/refresh").then(store),

  /** End the session server-side and locally - local clear always happens. */
  logout: async (): Promise<void> => {
    try {
      // `keepalive`: the sign-out that sends this navigates away at once,
      // and a page unload would otherwise cancel the revoke in flight.
      await api.post("/api/v1/auth/logout", undefined, { keepalive: true });
    } finally {
      clearSession();
    }
  },

  /**
   * Ask for a reset link. Always resolves the same way for any address:
   * the backend returns a generic receipt so the screen cannot be used to
   * discover whether an account exists.
   *
   * Email delivery is a deployment concern on the backend's side - a 200
   * here means the request was accepted, not that a message has landed.
   */
  requestPasswordReset: (email: string) =>
    api.post<{ status: string; message: string }>(
      "/api/v1/auth/forgot-password",
      { email },
    ),

  /** Set the new password, using the token from the emailed link. */
  completePasswordReset: (payload: { token: string; password: string }) =>
    api.post<unknown>("/api/v1/auth/password-reset/complete", payload),

  /**
   * Complete the OAuth redirect from Microsoft/Google.
   *
   * All three params are REQUIRED by the contract (`code` minLength 1,
   * `state` minLength 3), and the response is a real session - the same shape
   * password sign-in returns. The path was previously `/auth/sso/callback`,
   * missing the `/api/v1` prefix, so it could never have reached the backend.
   *
   * Starting the flow is still blocked: both start endpoints need a
   * `schoolSlug`, and the only thing that returns one is `sso/status`, which
   * 404s until a school is already connected. So this completes a handshake
   * nothing can yet begin - see `sso.ts`.
   */
  ssoCallback: (query: { provider: string; code: string; state: string }) =>
    api.get<{
      accessToken: string;
      tokenType: string;
      expiresAt: string;
      role: string;
      userId: string;
      destination: SsoFirstUseDestination;
      replacedSession?: boolean | null;
    }>("/api/v1/auth/sso/callback", { params: query }),
};
