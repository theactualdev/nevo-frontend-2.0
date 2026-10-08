import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ROLE_COOKIE } from "@/lib/auth/session";
import { isAdminRole, USER_ROLES } from "@/lib/constants/permissions";

/**
 * Route guard. Next 16 renamed the `middleware` convention to `proxy`; one
 * file per project, at the same level as `app/`.
 *
 * OPTIMISTIC ONLY. It reads the role mirror cookie written by
 * `lib/auth/session.ts` - never the Bearer token, which lives in
 * localStorage and is invisible to any server. The cookie is client-written
 * and forgeable, so this decides *routing*, not access: the FastAPI Bearer
 * check is the authorization boundary, and every teacher surface still
 * fetches through the API client. What this buys is that a signed-out
 * visitor never receives console markup at all - no flash of a roster that
 * isn't theirs.
 *
 * ALL THREE CONSOLES NOW. The student app was left out because onboarding is a
 * long pre-auth flow, which is true of the onboarding routes and of nothing
 * else - and the daily app was reachable by anyone.
 *
 * The reason to close it is NOT data. A signed-out student render carries no
 * real child's data at all: every screen gates live reads behind
 * `useHasSession`/`useHydrated`, and the server markup for `/student/dashboard`
 * and friends contains fixtures only, which was checked rather than assumed.
 *
 * The reason is what a returning child was shown. `getSession()` clears itself
 * once `expiresAt` passes, so there is no token left to send, so nothing 401s,
 * so `handleAuthFailure` never fires and never sends them to the door. A child
 * coming back the next morning got the full designed walkthrough - another
 * child's name, another child's lessons - presented as their own, and nothing
 * on the screen said otherwise. The cookie expires with the session, so its
 * absence is exactly the signal that case needs.
 *
 * The admin check is `isAdminRole`, never `role === "admin"`: the API returns
 * `senco_admin` or `other_admin` and nothing else, confirmed against a live
 * account rather than read off the schema.
 */

const SIGN_IN = "/auth/teacher";
const CONSOLE_HOME = "/teacher/dashboard";
const ADMIN_SIGN_IN = "/auth/admin";
// `/admin` chooses the persona home from the caller's scopes, which this
// file cannot see - it holds only the role mirror cookie. See
// `adminHomeForScopes`.
const ADMIN_HOME = "/admin";
/** The child's door is the PIN screen, not a password form. */
const STUDENT_SIGN_IN = "/auth/login";
/**
 * The door for a device that remembers nobody (frame 00c). Separate from the
 * PIN screen because it asks for a school code and username as well - the PIN
 * screen has no fields at all, only the pad.
 */
const STUDENT_RETURNING_SIGN_IN = "/auth/sign-in";
const STUDENT_HOME = "/student/dashboard";
/**
 * The first screen of the flow that CREATES an account, and the only onboarding
 * route a signed-in child has no business on.
 *
 * The root only, deliberately. Onboarding ends by storing the first PIN, which
 * stores the session before routing the child on, so the later steps are
 * legitimately reached WITH a session and bouncing them would break the end of
 * the flow for every new child.
 */
const STUDENT_ONBOARDING_ROOT = "/student/onboarding";

/** The invite link lands here with no session - it is how you get one. */
/**
 * `/teacher/help` is here for the same reason its endpoint is public: a teacher
 * who cannot sign in is exactly who needs the support details. Gating it would
 * mean the one screen that explains how to get help is only reachable once you
 * no longer need it.
 */
const PRE_AUTH_TEACHER_ROUTES = ["/teacher/onboarding", "/teacher/help"];
/** D01 stands the workspace up before anyone can possibly have a session. */
const PRE_AUTH_ADMIN_ROUTES = ["/admin/onboarding"];
/**
 * Onboarding is the flow that CREATES the session, so it cannot require one.
 * It ends by storing the first PIN, which stores the session (and with it this
 * cookie) before routing the child into their first lesson - so every route
 * below is genuinely reachable with a session by the time it is asked for.
 *
 * NO ENTRY LINK. `/student/entry/{token}` was let through here, and it is gone:
 * its endpoint never resolved for anyone (B2), and 05 Entry under
 * `/student/onboarding` is the one way in (SCRUM-208).
 */
const PRE_AUTH_STUDENT_ROUTES = ["/student/onboarding"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const role = request.cookies.get(ROLE_COOKIE)?.value;
  const isTeacher = role === USER_ROLES.TEACHER;
  const isAdmin = isAdminRole(role);
  const isStudent = role === USER_ROLES.STUDENT;

  if (pathname.startsWith("/teacher")) {
    if (PRE_AUTH_TEACHER_ROUTES.some((p) => pathname.startsWith(p))) {
      return NextResponse.next();
    }
    if (!isTeacher) {
      const url = new URL(SIGN_IN, request.url);
      // So the door can send them back where they were headed - query and all
      // (T217): a class's tab or a lesson's section lives there.
      url.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin")) {
    if (PRE_AUTH_ADMIN_ROUTES.some((p) => pathname.startsWith(p))) {
      return NextResponse.next();
    }
    if (!isAdmin) {
      const url = new URL(ADMIN_SIGN_IN, request.url);
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/student")) {
    /*
     * A SIGNED-IN CHILD DOES NOT START ONBOARDING AGAIN.
     *
     * This is the door a baseline reached the wrong child's account through.
     * The flow collects a name, a school and a class and then runs the motor
     * baseline, and none of that knows a session is already live - so the
     * measurements were taken from whoever was holding the tablet and written
     * against whoever was still signed in. The ownership guard added to the
     * parked baseline on 16 Sep stops the send; this stops the walk that
     * produces it, which is the half that a child actually experiences.
     *
     * It is also plainly wrong on its own terms: a child who already has an
     * account being asked to make one is the product forgetting them.
     *
     * NO EXCEPTION FOR `?token=` ANY MORE. It let a join link through, for a
     * different child arriving on a device someone was signed into. A child is
     * never sent a link (design, D5), so a token on this address is nobody's.
     *
     * Safe to bounce for the same reason the PIN screen below is: signing out
     * is a HARD navigation, so the cookie clear has settled before this runs.
     */
    if (
      isStudent &&
      // A trailing slash would otherwise fall straight through to the pre-auth
      // allowance below and render the very screen this is closing.
      pathname.replace(/\/+$/, "") === STUDENT_ONBOARDING_ROOT
    ) {
      return NextResponse.redirect(new URL(STUDENT_HOME, request.url));
    }
    if (PRE_AUTH_STUDENT_ROUTES.some((p) => pathname.startsWith(p))) {
      return NextResponse.next();
    }
    if (!isStudent) {
      const url = new URL(STUDENT_SIGN_IN, request.url);
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Nobody signed in has any use for their own door.
  if (pathname === SIGN_IN && isTeacher) {
    return NextResponse.redirect(new URL(CONSOLE_HOME, request.url));
  }
  if (pathname === ADMIN_SIGN_IN && isAdmin) {
    return NextResponse.redirect(new URL(ADMIN_HOME, request.url));
  }
  // Safe to bounce a signed-in child off the PIN screen because signing out
  // uses a HARD navigation, not a router push - `ProfileSettings` does that
  // deliberately, so the cookie clear has settled before this is asked. A
  // client-side push would race it and land them back in the console.
  if (
    (pathname === STUDENT_SIGN_IN || pathname === STUDENT_RETURNING_SIGN_IN) &&
    isStudent
  ) {
    return NextResponse.redirect(new URL(STUDENT_HOME, request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Narrow on purpose: nothing else is guarded, so static assets and the
  // /api/backend proxy route never reach this file.
  matcher: [
    "/teacher",
    "/teacher/:path*",
    "/auth/teacher",
    "/admin",
    "/admin/:path*",
    "/auth/admin",
    "/student",
    "/student/:path*",
    "/auth/login",
    "/auth/sign-in",
  ],
};
