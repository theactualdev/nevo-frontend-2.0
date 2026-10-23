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
 * names, and then back to the page that was refused - or Home, when there is
 * none to go back to (`OnboardingResume`, `returnPathOf`).
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

/** The query the continue route reads the way back from. */
export const RETURN_PARAM = "next";

/** A student page, as a bare path with an optional plain query. */
const STUDENT_PAGE = /^\/student\/[A-Za-z0-9_/-]*(\?[A-Za-z0-9_=&%-]*)?$/;

/**
 * The page a child is sent back to once onboarding is finished, or null.
 *
 * On the 20 Oct production run a child who tapped Start on a lesson was sent
 * to finish Module 4 and, once it was sat, landed on Home - not on the lesson
 * they had asked for. So the refused page rides to the continue route and
 * back. It arrives in a URL, which anyone can write, so ONLY A SAME-SITE
 * STUDENT PAGE is taken: `/student/...` as a bare path of letters, digits,
 * `-`, `_` and `/`, with at most a plain query (a lesson link's
 * `?assignment=`). No host, no `//`, no backslash, no dots at all - so no
 * `..` - and never an onboarding route, which would send a child who has
 * just finished back into the flow that finished them.
 */
export function returnPathOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!STUDENT_PAGE.test(value) || value.includes("//")) return null;
  if (value.startsWith("/student/onboarding")) return null;
  return value;
}

/** The lesson player's own address: `/student/lessons/<uuid>`, query or not. */
const LESSON_PAGE =
  /^\/student\/lessons\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\?|$)/i;

/**
 * The lesson a way back leads to, or null: what Module 4 is asked about when
 * onboarding is being finished because of it (SCRUM-266).
 *
 * Teslim, 21 Oct: readiness, the probe's `next` and its `answer` each take a
 * `lessonId`, and with it "the backend validates the lesson/subject and
 * limits items to the lesson's concepts". So the child who tapped Start on a
 * lesson about osmosis is asked about osmosis, not the first subject listed.
 *
 * ONLY THE LESSON PLAYER'S ROUTE YIELDS ONE, and only a UUID - every one of
 * the three takes `lessonId` as a UUID and answers anything else 422. A
 * lesson's review or summary is not the lesson; Home, or a fixture's id, is
 * no lesson at all, and nothing is sent: the probe runs as it does with no
 * lesson. Read only from a path `returnPathOf` has already taken.
 */
export function lessonIdOf(path: string | null | undefined): string | null {
  const back = returnPathOf(path);
  return back ? (LESSON_PAGE.exec(back)?.[1] ?? null) : null;
}

/** A page, without its query. */
const pageOf = (path: string) => path.split("?")[0];

/**
 * Where "onboarding is done" goes: the first way back the server names that
 * this device honours, else the one the refusal brought, else null (Home).
 *
 * THE SERVER'S WAY BACK FIRST (Teslim, 21 Oct, SCRUM-266). It remembers the
 * lesson a child was refused - "Opening an assigned lesson while onboarding
 * is incomplete also remembers that lesson" - and names it: the probe's
 * finish as `navigatesTo`, readiness as `returnTo`, both a bare
 * `/student/lessons/<id>` (`probe._finish`, `learning_readiness.readiness`).
 * "The backend cannot navigate a browser", so this follows it, in that order,
 * ahead of the continue route's `?next=` - which is only what this device saw
 * refused, Home included.
 *
 * EACH CHECKED AS `?next=` IS (`returnPathOf`): a same-site student page as a
 * bare path, or skipped for the next in line. A full URL is skipped too: the
 * server sends a path, and an address with a host is not one this device
 * follows, whatever host it names.
 *
 * THE SAME PAGE KEEPS THE REFUSAL'S QUERY. The server names the lesson bare;
 * the link the child tapped carried `?assignment=`, which every progress
 * write files their work under (`lessonHref`). So when the server's lesson is
 * the page that was refused, the refused address is the one taken - the same
 * lesson, opened as the child opened it.
 *
 * Decides nothing about onboarding: only which page "done" opens. The
 * caller still takes it once per tab (`claimReturn`), so a lesson that still
 * refuses sends the child Home, not round again.
 */
export function wayBack(
  server: readonly unknown[],
  refused: string | null | undefined,
): string | null {
  const ours = returnPathOf(refused);
  for (const named of server) {
    const path = returnPathOf(named);
    if (!path) continue;
    return ours && pageOf(ours) === pageOf(path) ? ours : path;
  }
  return ours;
}

/**
 * Where a refused request sends a child onboarding is not finished for, or
 * null to leave the refusal with whoever made it.
 *
 * ONLY A CHILD, ONLY THIS CODE, and never from an onboarding route itself: a
 * refusal met there must not reload the very flow that is finishing it.
 *
 * The continue route is told the refused page, `pathname` and `search`, when
 * it is one a child may be sent back to (`returnPathOf`), so finishing takes
 * them back there. Only the continue route: a server-named onboarding path is
 * not one that reads it.
 *
 * Pure so it can be tested, for the reason `withdrawnDoor` is: jsdom will not
 * let a test observe `window.location`.
 */
export function onboardingDoor(
  role: string | null | undefined,
  status: number,
  detail: unknown,
  pathname: string,
  search = "",
): string | null {
  if (role !== USER_ROLES.STUDENT) return null;
  if (!isOnboardingRequired({ status, detail })) return null;
  if (pathname.startsWith("/student/onboarding")) return null;
  const door = onboardingPath(refusal(detail).navigatesTo);
  if (door !== ONBOARDING_CONTINUE_ROUTE) return door;
  const back = returnPathOf(pathname + search);
  return back
    ? `${door}?${RETURN_PARAM}=${encodeURIComponent(back)}`
    : door;
}

const MOVED_ON = "nevo:onboarding:moved-on-without-probe";

/**
 * THE LOOP GUARD, for a Module 4 with nothing to ask.
 *
 * Olayinka, 19 Oct: "an unavailable probe moves the child on, never to a dead
 * end", under Teslim's 19 Oct no-question-bank exception. So the continue
 * route moves such a child on - back to the page they were refused, or Home -
 * rather than leaving them on a screen to dismiss. But until the server
 * applies the exception, its gate still refuses their lessons with 409
 * `onboarding_required`, and that refusal sends them straight back to the
 * continue route - lesson, refused, continue, lesson, for ever. The client's
 * latch cannot stop it: `client.ts` leaves with
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
  if (!userId) return false;
  return claimOnce(`${MOVED_ON}:${userId}`);
}

const RETURNED = "nevo:onboarding:returned";

/**
 * THE LOOP GUARD, for the way back to the page that was refused.
 *
 * The continue route sends a child who has finished onboarding back to the
 * page that sent them there (`returnPathOf`). But on the 21 Oct on-screen
 * check a lesson whose read still answered 409 `onboarding_required` while
 * readiness said complete - server state stale or out of step - sent the
 * child round for ever: lesson, refused, continue, complete, lesson, every
 * few seconds, the screen flickering between blank and "Getting your lesson
 * ready", never reaching Home. Before the way back existed, that case went
 * Home and stopped. Module 4 sat while the gate still refuses is the same.
 *
 * So the way back is taken ONCE PER TAB PER CHILD PER PAGE, in
 * `sessionStorage`, for the reason `claimMoveOn` is. True the first time, and
 * the caller goes back; false every time after - and whenever it cannot be
 * recorded, since a return that cannot be counted is one that could loop -
 * and the caller goes Home, as it did before the way back existed. Never the
 * nothing-state: onboarding is done as far as the server's readiness says.
 * Another page is its own claim, so the next lesson a child is refused still
 * brings them back to it once.
 *
 * IT DECIDES NOTHING ABOUT ONBOARDING. Not a completion, a placement or a
 * pass: the server's readiness still decides that on every arrival, and its
 * gate what opens. It only chooses between the refused page and Home. It
 * holds the child's id and the page's path, nothing else, and is not swept
 * at sign-out (`sessionLeftovers` sweeps no onboarding key); it dies with
 * the tab.
 */
export function claimReturn(
  userId: string | null | undefined,
  path: string,
): boolean {
  if (!userId || !path) return false;
  return claimOnce(`${RETURNED}:${userId}:${path}`);
}

/** True the first time this tab records `key`; false after, or unrecordable. */
function claimOnce(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const store = window.sessionStorage;
    if (store.getItem(key) !== null) return false;
    store.setItem(key, "1");
    return store.getItem(key) !== null;
  } catch {
    return false;
  }
}
