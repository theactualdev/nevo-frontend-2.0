import { USER_ROLES } from "@/lib/constants/permissions";

/**
 * THE SERVER'S GATE ON LEARNING, AND WHERE IT SENDS A CHILD (SCRUM-244).
 *
 * Lydia, 17 Oct: "Onboarding is four modules. Module 4 IS the domain probe
 * ... All four run before any lesson." The deployed backend enforces it: a
 * student's lesson reads, `next-work` and the adaptation context answer
 * 409 `onboarding_required` until all four are in
 * (`learning_runtime.require_onboarding`), with `missingModules` and a
 * `navigatesTo`. Every one of those callers would otherwise show its own
 * "Something went wrong" - untrue, and an invitation to try again at a door
 * that will not open.
 *
 * Imports nothing from the API client, which acts on it: see `consentHold`.
 */
export const ONBOARDING_REQUIRED = "onboarding_required";

/**
 * Where a signed-in child finishes onboarding: the modules the server still
 * names, and then Home (`OnboardingResume`).
 *
 * Its own route because the server's `navigatesTo`, `/student/onboarding`, is
 * the Welcome screen - the first door of the flow that CREATES an account,
 * which `proxy.ts` closes to a signed-in child by sending them Home. Followed
 * literally it would bounce the child Home, whose lessons answer 409 again.
 */
export const ONBOARDING_CONTINUE_ROUTE = "/student/onboarding/continue";

/** The onboarding routes that make an account, not finish one. */
const ACCOUNT_DOORS = [
  "/student/onboarding",
  "/student/onboarding/school",
  "/student/onboarding/teacher-join",
  "/student/onboarding/sequence",
];

/**
 * The onboarding path a refusal names, if this device honours it.
 *
 * ONLY `/student/onboarding...`, as a bare path: no other route, no host, no
 * query, no `..`. And never an account-creating door - a signed-in child
 * there would be making a second account - so those, and anything else,
 * resolve to the continue route.
 */
export function onboardingPath(navigatesTo: unknown): string {
  if (typeof navigatesTo !== "string") return ONBOARDING_CONTINUE_ROUTE;
  if (!/^\/student\/onboarding(\/[a-z0-9-]+)*\/?$/.test(navigatesTo)) {
    return ONBOARDING_CONTINUE_ROUTE;
  }
  const path = navigatesTo.replace(/\/+$/, "");
  return ACCOUNT_DOORS.includes(path) ? ONBOARDING_CONTINUE_ROUTE : path;
}

/** The refusal's own fields, `{ detail: { code, navigatesTo } }`, or nothing. */
function refusal(detail: unknown): { code?: unknown; navigatesTo?: unknown } {
  if (!detail || typeof detail !== "object") return {};
  const inner = (detail as { detail?: unknown }).detail;
  return inner && typeof inner === "object" ? inner : {};
}

/**
 * Whether a refused request was the server's onboarding gate - an `ApiError`
 * with its status and parsed body, read by shape.
 */
export function isOnboardingRequired(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const { status, detail } = err as { status?: unknown; detail?: unknown };
  return status === 409 && refusal(detail).code === ONBOARDING_REQUIRED;
}

/**
 * Where a refused request sends a child onboarding is not finished for, or
 * null to leave the refusal with whoever made it.
 *
 * ONLY A CHILD, ONLY THIS CODE, and never from an onboarding route itself: a
 * refusal met there must not reload the very flow that is finishing it.
 *
 * Pure so it can be tested, for the reason `withdrawnDoor` is: jsdom will not
 * let a test observe `window.location`.
 */
export function onboardingDoor(
  role: string | null | undefined,
  status: number,
  detail: unknown,
  pathname: string,
): string | null {
  if (role !== USER_ROLES.STUDENT) return null;
  if (!isOnboardingRequired({ status, detail })) return null;
  if (pathname.startsWith("/student/onboarding")) return null;
  return onboardingPath(refusal(detail).navigatesTo);
}

const MOVED_ON = "nevo:onboarding:moved-on-without-probe";

/**
 * THE LOOP GUARD, for a Module 4 with nothing to ask.
 *
 * Olayinka, 19 Oct: "an unavailable probe moves the child on, never to a dead
 * end", under Teslim's 19 Oct no-question-bank exception. So the continue
 * route sends such a child Home rather than leaving them on a screen to
 * dismiss. But until the server applies the exception, its gate still refuses
 * their lessons with 409 `onboarding_required`, and that refusal sends them
 * straight back to the continue route - Home, lesson, refused, continue, Home,
 * for ever. The client's latch cannot stop it: `client.ts` leaves with
 * `location.assign`, a full load, and every load starts unlatched.
 *
 * So the move on is taken ONCE PER TAB PER CHILD, in `sessionStorage`, which
 * survives those loads and dies with the tab. True the first time, and the
 * caller moves the child on; false every time after - and whenever it cannot
 * be recorded, since a move that cannot be counted is one that could loop -
 * and the caller stays on its calm nothing-state, Home offered, not taken.
 *
 * IT DECIDES NOTHING ABOUT ONBOARDING. It is not a completion, a placement or
 * a pass: no lesson opens because of it, every 409 still sends the child to
 * the continue route, and that route still asks the server's readiness on
 * every arrival. It only chooses which of two screens with no claim in them
 * the child is left on.
 */
export function claimMoveOn(userId: string | null | undefined): boolean {
  if (!userId || typeof window === "undefined") return false;
  const key = `${MOVED_ON}:${userId}`;
  try {
    const store = window.sessionStorage;
    if (store.getItem(key) !== null) return false;
    store.setItem(key, "1");
    return store.getItem(key) !== null;
  } catch {
    return false;
  }
}
