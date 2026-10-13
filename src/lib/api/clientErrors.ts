import { api, ApiError, incidentId } from "./client";

/**
 * Crash reports, `POST /api/v1/client-errors` (backend B36, live 5 Oct).
 *
 * WHY. Board 28's error screens tell a child "We're on it." Until this, nobody
 * was: a crash reached the console of the tablet it happened on and nowhere
 * else, so the promise on the screen was the one thing about it that was not
 * true. The lesson boundary even said so, in a `TODO(observability)`.
 *
 * THE BODY IS THE CONTRACT'S `ClientErrorReport`, AND NOTHING ELSE. Backend
 * closed the field list on purpose: "A stack trace and a route are about our
 * code; a lesson's text, a question, or anything the learner typed is not."
 * So what leaves here is about our code, and each field is cut down to that:
 *
 *  - `message` keeps the error's name and wording but not what it QUOTES. V8's
 *    `JSON.parse` failure quotes the text it choked on, and on this app that
 *    text can be a lesson or a child's held answer. Double-quoted spans and URL
 *    query strings are blanked; the shape of the fault survives.
 *  - `stack` is the FRAMES ONLY. V8 opens a stack with the message itself, so
 *    keeping the whole string would carry back everything the message filter
 *    took out.
 *  - `route` is the path with every value-shaped segment replaced. A lesson id
 *    is harmless, but `/student/entry/[token]` carries a credential in the
 *    path, and the two cannot be told apart by looking. The query string never
 *    leaves: join tokens ride there.
 *  - No token in the body. The request carries the session the usual way, so
 *    backend records the account "when there is one", as the endpoint says.
 *
 * ONCE PER ERROR, AND IT NEVER SHOWS. Fire-and-forget: a report that fails is
 * dropped without a word, because a second failure screen about the first one
 * helps nobody. The same fault reported again - React re-rendering a boundary,
 * a child pressing "Try again" on something that fails the same way - is sent
 * once per page.
 */

/** `ClientErrorReport.surface`, the contract's enum. */
export type ClientErrorSurface =
  | "student"
  | "teacher"
  | "admin"
  | "parent"
  | "unknown";

/** `ClientErrorReport`, field for field. */
export interface ClientErrorReport {
  message: string;
  route?: string | null;
  stack?: string | null;
  appVersion?: string | null;
  surface?: ClientErrorSurface;
  incidentId?: string | null;
}

// The contract's own bounds. A report past one is a 422, which loses it.
const MESSAGE_MAX = 2000;
const ROUTE_MAX = 300;
const STACK_MAX = 20000;
const VERSION_MAX = 80;
const INCIDENT_MAX = 40;

/**
 * One of our own route names, rather than a value: `student`, `warm-up`,
 * `review-session`. Anything else in a path is an id, a slug or a token.
 */
const ROUTE_WORD = /^[a-z]+(?:-[a-z]+)*$/;
const ROUTE_WORD_MAX = 24;

/** Stands in for a path segment that was a value. */
const PARAM = ":param";

function valueSegments(pathname: string): string[] {
  return pathname
    .split(/[?#]/)[0]
    .split("/")
    .filter((s) => s && !(s.length <= ROUTE_WORD_MAX && ROUTE_WORD.test(s)));
}

/** The path a crash happened on, with every value taken out. */
export function reportableRoute(pathname: string): string {
  const values = new Set(valueSegments(pathname));
  return pathname
    .split(/[?#]/)[0]
    .split("/")
    .map((s) => (values.has(s) ? PARAM : s))
    .join("/")
    .slice(0, ROUTE_MAX);
}

/**
 * Take the page's own path values out of a piece of text. An inline script's
 * frame carries the page URL, and a message can quote a path.
 */
function withoutPathValues(text: string, pathname: string): string {
  let out = text;
  for (const value of valueSegments(pathname)) {
    // Short values ("2", "ab") would blank unrelated text; nothing that short
    // is a credential.
    if (value.length >= 6) out = out.split(value).join(PARAM);
  }
  return out;
}

/** Keep a URL's address, never its query string or fragment. */
function withoutQueries(text: string): string {
  return text.replace(/(https?:\/\/[^\s?#"')]+)[?#][^\s"')]*/g, "$1");
}

/** What the error says about itself, with anything it quotes blanked. */
export function reportableMessage(error: unknown, pathname = ""): string {
  if (!(error instanceof Error)) {
    // A thrown string could be anything at all, so only its kind is sent.
    return `Non-error thrown: ${typeof error}`;
  }
  const name = error.name || "Error";
  const said = withoutPathValues(
    withoutQueries(error.message ?? "").replace(/"[^"\n]*"/g, '"[redacted]"'),
    pathname,
  ).trim();
  // Next's server-render digest: a hash that finds the server's own log line.
  const digest = (error as { digest?: unknown }).digest;
  const tail = typeof digest === "string" && digest ? ` (digest ${digest})` : "";
  return `${said ? `${name}: ${said}` : name}${tail}`.slice(0, MESSAGE_MAX);
}

/**
 * A V8 frame (`    at fn (url:1:2)`), or a JavaScriptCore / SpiderMonkey one
 * (`fn@url:1:2`, or a bare `url:1:2`). Everything else in a stack is the
 * message again.
 */
const FRAME = /^\s*at\s|@\S*:\d+:\d+\s*$|^\S+:\d+:\d+\s*$/;

/** The stack's frames, with the message lines V8 puts above them dropped. */
export function reportableStack(stack: unknown, pathname = ""): string | null {
  if (typeof stack !== "string") return null;
  const frames = stack.split("\n").filter((line) => FRAME.test(line));
  if (frames.length === 0) return null;
  return withoutPathValues(withoutQueries(frames.join("\n")), pathname).slice(
    0,
    STACK_MAX,
  );
}

/**
 * Which console a path belongs to, for the app-wide boundary that cannot know
 * from where it is mounted. The child's sign-in doors are the child's.
 */
export function surfaceForPath(pathname: string): ClientErrorSurface {
  if (
    /^\/(student|auth\/(login|sign-in|forgot-pin|session-expired|session-ended))(\/|$)/.test(
      pathname,
    )
  )
    return "student";
  if (/^\/(teacher|auth\/teacher)(\/|$)/.test(pathname)) return "teacher";
  if (/^\/(admin|auth\/admin)(\/|$)/.test(pathname)) return "admin";
  if (/^\/parent(-portal|-sign-in)?(\/|$)/.test(pathname)) return "parent";
  return "unknown";
}

/**
 * The build this ran on, where the host exposes it - Vercel puts the commit
 * there. Absent elsewhere, and then the field is simply null.
 */
function appVersion(): string | null {
  const sha = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;
  return sha ? sha.slice(0, VERSION_MAX) : null;
}

/** The report for one error, as the contract takes it. Pure. */
export function clientErrorReport(
  error: unknown,
  surface: ClientErrorSurface,
  pathname: string,
): ClientErrorReport {
  // The server's reference for a failed read, when that is what was thrown,
  // so the crash and the 500 behind it can be found together.
  const incident = error instanceof ApiError ? incidentId(error.detail) : null;
  return {
    message: reportableMessage(error, pathname),
    route: pathname ? reportableRoute(pathname) : null,
    stack:
      error instanceof Error ? reportableStack(error.stack, pathname) : null,
    appVersion: appVersion(),
    surface,
    incidentId: incident && incident.length <= INCIDENT_MAX ? incident : null,
  };
}

/**
 * Faults already reported from this page, so each is sent once. Keyed on what
 * the fault IS rather than on the error object: a boundary that re-renders, or
 * a "Try again" that fails the same way, makes a new object for the same fault.
 */
const reported = new Set<string>();

/**
 * A page that keeps crashing in new ways stops reporting after this many. A
 * child's tablet is often on metered data, and ten reports of one bad page say
 * everything an eleventh would.
 */
const MAX_REPORTS_PER_PAGE = 10;

/**
 * Send one crash report, and forget it.
 *
 * Not from a development build: the dev server talks to the same backend as
 * everyone else, and its crashes are already on the developer's screen.
 */
export function reportClientError(
  error: unknown,
  surface: ClientErrorSurface,
): void {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV === "development") return;
  const report = clientErrorReport(error, surface, window.location.pathname);
  const fault = [
    report.surface,
    report.route,
    report.message,
    report.stack?.split("\n")[0] ?? "",
  ].join("|");
  if (reported.has(fault) || reported.size >= MAX_REPORTS_PER_PAGE) return;
  reported.add(fault);
  // `keepalive` so a child who taps "Go back" at once does not cancel it.
  void api
    .post("/api/v1/client-errors", report, { keepalive: true })
    .catch(() => {});
}
