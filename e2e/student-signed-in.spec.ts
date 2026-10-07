import { randomInt } from "node:crypto";
import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Locator,
  type Page,
} from "@playwright/test";

/**
 * The student console, SIGNED IN.
 *
 * Same single property as the teacher and admin suites, and it matters more
 * here: **a signed-in child is never shown invented data.** Every console in
 * this product is live-first with a fixture fallback, so "the child signs in and
 * sees lessons" passes when the read fails - the fallback renders lessons. The
 * question this file asks is "is anything on this page a fixture", which the
 * failure mode cannot satisfy. Every fixture render carries `data-nevo-sample`.
 *
 * ## Where the credential comes from, and why it is not a secret
 *
 * A child signs in with school code + login identifier + PIN, and there is no
 * PIN to keep in a secret store: since SCRUM-216 no adult ever sets or sees a
 * child's PIN. An admin can only CLEAR one, with
 * `POST /api/v1/students/{id}/pin/clear`, which never accepts, returns or
 * generates a PIN. The child then sets their own through
 * `POST /api/v1/student-entry/pin` with the school code and their Student ID.
 * That door only opens while the PIN is unset, and it answers with a session.
 *
 * So this suite does what the school and the child would do. It signs in as
 * the E2E admin and clears the probe's PIN. Then, as the child, it sets a fresh
 * random four-digit PIN through that door and keeps the session it returns.
 * The PIN is never fixed and never printed. It lives in this run's memory and
 * stops working at the next run's clear.
 *
 * The Student ID comes from `E2E_STUDENT_ADMISSION` because no student read
 * returns it, and the child's door takes nothing else. It is not a secret: what
 * authorises the set is the admin's clear, not anything the child knows. It
 * must be the Student ID of the child `E2E_STUDENT_LOGIN` names, and
 * `beforeAll` fails if the door signs in anyone else.
 *
 * **Who clears it.** SCRUM-216 gives the clear to the teachers of the child's
 * classes; the admin console has no PIN control, and backend is expected to
 * take admin access off the endpoint. So the suite clears as the E2E TEACHER
 * whenever `E2E_TEACHER_EMAIL`/`E2E_TEACHER_PASSWORD` are set - that teacher
 * must teach one of the probe's classes - and as the admin only while those
 * secrets do not exist. Once backend removes admin access, they are required.
 *
 * **Running it CLEARS AND SETS that student's PIN**, which is why the student
 * is named explicitly rather than defaulted: the write is opt-in. Point it at
 * a probe account nobody reads by hand.
 *
 * ## Why the PIN is set ONCE
 *
 * Each clear and set changes the PIN. The set issues a session, and each
 * `POST /auth/login/pin` issues one too, and every new session REPLACES the
 * last one (`replacedSession`). Setting per test would churn both and invite
 * the throttling both doors carry. So there is one clear and one set in
 * `beforeAll`, and every test plants that same session. The one test that
 * drives the real sign-in form runs LAST, because the session it creates
 * replaces the planted one.
 *
 * ## The coupling this catches
 *
 * A child-set PIN is exactly four digits, the only length the child's door
 * accepts. The form test below types that PIN into the real form, so a form
 * that cannot take the PIN a child just set fails here.
 *
 * Admin resets no longer issue PINs, so this suite has no way to get the
 * six-digit kind. The sign-in route still accepts six digits for older
 * accounts, and the form takes four to eight. But nothing here types six any
 * more, so that path is not covered by this file.
 *
 * ## The school code is read, never written down
 *
 * Migration 0086 (SCRUM-201, 30 Sep) regenerated every school code into a
 * four-character alphabet with no 0, O, 1 or I, so a fixture holding the old
 * code signed nobody in. A missing school and a wrong PIN both answer 401
 * `authentication_failed` by design, so that failure read as a bad PIN. The
 * code now comes from the E2E admin's own school record, and both the child's
 * PIN door and the sign-in form are given that.
 *
 * ## What the child has is asked, never assumed
 *
 * `beforeAll` reads the probe's dashboard and progress on the child's own
 * session, and the tests that need a subject, a lesson or a finished lesson
 * take one from there. Where the API says the child has none, the test SKIPS
 * and says so - a skip is visible, a pass on nothing is not. Where the read
 * itself FAILED, the test fails: a failed read is not "has none", and treating
 * it as one is the failure-as-emptiness this whole console has been fixed for.
 *
 * ## What this file writes, and nothing else
 *
 * 1. **The probe's PIN, on every run.** In `beforeAll` the admin clears it and
 *    the child's door sets a new one, which also signs the probe in. The real
 *    sign-in in the last test adds one more session. Described above. If the
 *    set fails after the clear, the probe is left with NO PIN until the next
 *    run clears and sets again. The spec says a teacher's clear is logged
 *    with the child and the time. It does not say whether an admin's is.
 * 2. **Opening a lesson**, in one test. The player opens a lesson session,
 *    writes the child's position (`in_progress` at the segment it opens on),
 *    asks the engine for its `lesson_load` plan and sends the player's
 *    signals; leaving through the lesson's own exit records `exited` at that
 *    same position. It picks a lesson the child is ALREADY part-way through
 *    where there is one, so a run moves nothing a child sees: part-way stays
 *    part-way. Only when none is part-way does it open a lesson not yet
 *    started - which makes that one part-way, once, and later runs reuse it.
 *
 * Every other test is READ-ONLY and is held to it: it records every write the
 * page sends and fails on any (`expectNoWrites`). Never, anywhere in this file:
 * finish a lesson, answer a check, submit feedback, sit or submit the warm-up,
 * ask Ask Nevo anything, choose a look, change a PIN through Profile, or send
 * a message.
 *
 * Connect is walked at PHONE width for that reason. On a tablet or desktop the
 * first conversation opens beside the list, and opening one marks it read on
 * the server - a write this file made on every run until it was looked for. On
 * a phone nothing opens until the child taps it.
 *
 * ## Waiting on the page, never on the clock
 *
 * Every test waits for something only the route's RESOLVED state draws - its
 * live screen, its empty state or its failure - and then asserts the failure is
 * not what it drew. Those elements exist only once the client is running and
 * the read has answered, so the absence of sample marks is checked at the one
 * moment it means something. Before hydration every one of these screens draws
 * a skeleton with no marks in it, which is exactly what the fixed two-second
 * waits this file used to sleep on could not tell apart from a pass. Clicks wait
 * the same way, on a control only a running page draws: a click before
 * hydration has no handler and is simply lost.
 *
 * One fixed wait remains, in the warm-up test, and it says why.
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const STUDENT_LOGIN = process.env.E2E_STUDENT_LOGIN;
/** The probe's Student ID, which the child's own PIN door takes. See above. */
const STUDENT_ADMISSION = process.env.E2E_STUDENT_ADMISSION;
/** Who clears the probe's PIN, when set. See "Who clears it" above. */
const TEACHER_EMAIL = process.env.E2E_TEACHER_EMAIL;
const TEACHER_PASSWORD = process.env.E2E_TEACHER_PASSWORD;
const API = process.env.E2E_API_BASE ?? "https://nevo-backend-2-0-kn3d.onrender.com";

/** Mirrors `lib/auth/session.ts`. Changing either without the other breaks this. */
const SESSION_KEY = "nevo.auth.session";
const ROLE_COOKIE = "nevo.role";
const SAMPLE_ATTR = "data-nevo-sample";

test.skip(
  !ADMIN_EMAIL || !ADMIN_PASSWORD || !STUDENT_LOGIN,
  "Set E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD and E2E_STUDENT_LOGIN to run the student suite. It clears that student's PIN and sets a new one.",
);
test.skip(
  !STUDENT_ADMISSION,
  "Set E2E_STUDENT_ADMISSION to the probe's Student ID. The suite sets the probe's PIN through the child's own door, which takes the school code and that ID, and no student read returns it.",
);

/** How long a live read may take before we call it broken. See the teacher suite. */
const LIVE_MS = 30_000;

/** Below the 768px two-pane break, where Connect opens nothing on its own. */
const PHONE = { width: 390, height: 844 };

/**
 * A well-formed lesson id that no lesson has. Well-formed on purpose: the
 * detail route types `lesson_id` as a UUID, so a malformed one would be a 422,
 * which the route rightly treats as a failed read rather than a missing lesson.
 */
const MISSING_LESSON = "00000000-0000-4000-8000-000000000000";

interface StudentSession {
  token: string;
  expiresAt: string;
  userId: string;
  role: string;
}

/** The parts of `GET /api/v1/students/me/dashboard` these tests choose from. */
interface ProbeDashboard {
  assignments: {
    id: string;
    status: string;
    availableFrom: string | null;
    lesson: { id: string; title: string };
  }[];
  recentProgress: { lessonId: string; status: string; updatedAt: string }[];
}

/** The parts of `GET /api/students/{id}/progress` these tests choose from. */
interface ProbeProgress {
  concepts: { name: string; subject: string | null }[];
  lessons: { lessonId: string; title: string; status: string }[];
}

/** A read made once in `beforeAll`: its status, and its body when it worked. */
interface Read<T> {
  status: number;
  body: T | null;
}

/**
 * Chosen at random in `beforeAll` and set as the probe's own. Never fixed and
 * never printed: no assertion or message in this file takes it as a value.
 * The one place it is kept is a FAILED test's trace, which records what the
 * sign-in test types. CI does not upload traces, and the PIN stops working at
 * the next run's clear.
 */
let pin = "";
/** Read from the admin's school in `beforeAll` - see the docblock above. */
let schoolCode = "";
let session: StudentSession;
/**
 * Where the server's consent answer sends this child. Read once so the sign-in
 * test knows which door is the right one - the dashboard, 00d, 00e, or the
 * hold for a read that failed - rather than asserting one and failing on
 * another.
 */
type ConsentDoor = "open" | "waiting" | "withdrawn" | "unread";
let consentDoor: ConsentDoor = "open";

/** The address each answer lands a child on, as `entryGate` routes it. */
const CONSENT_LANDING: Record<ConsentDoor, RegExp> = {
  open: /\/student\/dashboard/,
  waiting: /\/student\/waiting/,
  withdrawn: /\/student\/unavailable/,
  unread: /\/student\/unchecked/,
};
let dashboardRead: Read<ProbeDashboard> = { status: 0, body: null };
let progressRead: Read<ProbeProgress> = { status: 0, body: null };

async function plantSession(page: Page) {
  await page.context().addCookies([
    { name: ROLE_COOKIE, value: session.role, url: "http://localhost:3100" },
  ]);
  // Before the first render: a console that mounts signed-out renders the very
  // fixtures this suite is checking for.
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [SESSION_KEY, JSON.stringify(session)] as const,
  );
}

async function sampleMarks(page: Page): Promise<string[]> {
  return page
    .locator(`[${SAMPLE_ATTR}]`)
    .evaluateAll((nodes) =>
      nodes.map((n) => n.getAttribute("data-nevo-sample") ?? "unknown"),
    );
}

async function expectNoSampleMarks(page: Page, where: string) {
  const marks = await sampleMarks(page);
  expect(marks, `${where} rendered fixture data: ${marks.join(", ")}`).toEqual([]);
}

/**
 * Wait for a route to RESOLVE, then insist it resolved live.
 *
 * `live` is something only the route's loaded or empty state draws, and
 * `failure` is the route's own words for a read that did not give it one.
 * Waiting for either means a broken read fails HERE, in words, rather than as
 * a timeout - and it does fail, because a failure state carries no sample
 * marks either and would otherwise sail through the assertion this file
 * exists for.
 */
async function resolvedLive(where: string, live: Locator, failure: Locator) {
  await expect(
    live.or(failure).first(),
    `${where} never left its loading state.`,
  ).toBeVisible({ timeout: LIVE_MS });
  await expect(
    failure,
    `${where} is showing a failure state, not its live one.`,
  ).toHaveCount(0);
}

/** Home, resolved: every branch but the skeleton is headed by the greeting. */
async function homeResolved(page: Page) {
  await resolvedLive(
    "Home",
    page.getByRole("heading", { level: 1, name: /^Welcome back/ }),
    page.getByText(/We couldn.t load your lessons just now/),
  );
}

/**
 * Profile, resolved. The disc carries the child's initials, which nothing
 * knows until the client is running and the account has answered. Before that
 * it is blank, never another child's.
 */
async function profileResolved(page: Page) {
  await expect(
    page.getByRole("button", { name: "Choose your look" }),
    "Profile never named the child: the account read did not answer.",
  ).toHaveText(/\S/, { timeout: LIVE_MS });
}

interface Write {
  method: string;
  path: string;
  body: unknown;
}

/**
 * Every write the page sends to the API while the test runs, recorded from
 * before the first navigation so nothing done on mount slips past. Reads are
 * not recorded: GET, HEAD and the browser's own preflights.
 */
function recordWrites(page: Page): Write[] {
  const writes: Write[] = [];
  page.on("request", (request) => {
    const method = request.method();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
    const { pathname } = new URL(request.url());
    const at = pathname.indexOf("/api/");
    if (at === -1) return;
    let body: unknown = null;
    try {
      body = request.postDataJSON();
    } catch {
      body = request.postData();
    }
    writes.push({
      method,
      // Proxied or direct, the same contract path.
      path: pathname.slice(at).replace(/^\/api\/backend(?=\/)/, ""),
      body,
    });
  });
  return writes;
}

const described = (writes: Write[]) => writes.map((w) => `${w.method} ${w.path}`);

/** The session keeping itself alive is not something the screen did. */
const SESSION_UPKEEP = "POST /api/v1/auth/session/refresh";

function expectNoWrites(writes: Write[], where: string) {
  expect(
    described(writes).filter((w) => w !== SESSION_UPKEEP),
    `${where} wrote to the API, and this test is read-only.`,
  ).toEqual([]);
}

/** A title as a literal inside a pattern. */
const literal = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** The probe's dashboard, or a failure that names the read. Never "nothing". */
function dashboard(): ProbeDashboard {
  expect(
    dashboardRead.body,
    `The probe's dashboard read failed (${dashboardRead.status}), so this test cannot know what the page should show.`,
  ).not.toBeNull();
  return dashboardRead.body!;
}

/** The probe's progress, or a failure that names the read. Never "nothing". */
function progress(): ProbeProgress {
  expect(
    progressRead.body,
    `The probe's progress read failed (${progressRead.status}), so this test cannot know what the page should show.`,
  ).not.toBeNull();
  return progressRead.body!;
}

/** Not yet open by its `availableFrom`. A null or unreadable date is open. */
const opensLater = (availableFrom: string | null) => {
  const opens = availableFrom ? Date.parse(availableFrom) : NaN;
  return !Number.isNaN(opens) && opens > Date.now();
};

/** Newest progress row per lesson: the feed is not guaranteed to be ordered. */
function latestByLesson(rows: ProbeDashboard["recentProgress"]) {
  const latest = new Map<string, ProbeDashboard["recentProgress"][number]>();
  for (const row of rows) {
    const held = latest.get(row.lessonId);
    if (!held || Date.parse(row.updatedAt) > Date.parse(held.updatedAt)) {
      latest.set(row.lessonId, row);
    }
  }
  return latest;
}

/**
 * A lesson the Lessons tab and Downloads should both list: set for this child,
 * not called off and already open. The same rule `useStudentLessons` lists by.
 */
function listedLessonTitle(): string | null {
  const listed = dashboard().assignments.find(
    (a) => a.status !== "cancelled" && !opensLater(a.availableFrom),
  );
  return listed?.lesson.title ?? null;
}

/** Where a page that lists the child's lessons must show one the API names. */
async function showsAListedLesson(page: Page, where: string) {
  const title = listedLessonTitle();
  // Nothing open to list: the route's empty state was what it settled on.
  if (!title) return;
  await expect(
    page.getByText(title, { exact: true }).first(),
    `${where} did not show "${title}", which the API says is set for this child.`,
  ).toBeVisible({ timeout: LIVE_MS });
}

/** A subject the progress read names, with one concept worked on in it. */
function firstSubject(): { name: string; concept: string } | null {
  const concept = progress().concepts.find((c) => c.subject?.trim());
  return concept ? { name: concept.subject!.trim(), concept: concept.name } : null;
}

/** The slug the Progress card links with - `subjectSlug` in useStudentProgress. */
const subjectHref = (name: string) => `/student/progress/${encodeURIComponent(name)}`;

/** A lesson this child has finished, from either read. Both must have answered. */
function finishedLesson(): { lessonId: string; title: string } | null {
  const { assignments, recentProgress } = dashboard();
  const { lessons } = progress();
  const latest = latestByLesson(recentProgress);
  const assigned = assignments.find(
    (a) =>
      a.status === "completed" || latest.get(a.lesson.id)?.status === "completed",
  );
  if (assigned) return { lessonId: assigned.lesson.id, title: assigned.lesson.title };
  const worked = lessons.find((l) => l.status === "completed");
  return worked ? { lessonId: worked.lessonId, title: worked.title } : null;
}

/**
 * The lesson to open: set, open, not finished - and part-way where possible,
 * so that opening and leaving it changes nothing a child sees. See "What this
 * file writes" above.
 */
function lessonToOpen(): { lessonId: string; assignmentId: string; title: string } | null {
  const { assignments, recentProgress } = dashboard();
  const latest = latestByLesson(recentProgress);
  const open = assignments.filter(
    (a) =>
      a.status !== "cancelled" &&
      a.status !== "completed" &&
      !opensLater(a.availableFrom) &&
      latest.get(a.lesson.id)?.status !== "completed",
  );
  const partWay = open.find((a) =>
    ["in_progress", "exited"].includes(latest.get(a.lesson.id)?.status ?? ""),
  );
  const chosen = partWay ?? open[0];
  return chosen
    ? { lessonId: chosen.lesson.id, assignmentId: chosen.id, title: chosen.lesson.title }
    : null;
}

async function readJson<T>(
  api: APIRequestContext,
  url: string,
  token: string,
): Promise<Read<T>> {
  const res = await api.get(url, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status(), body: res.ok() ? ((await res.json()) as T) : null };
}

/**
 * A refusal's `detail.code`, for a failure message, and nothing for a success.
 * Only the code: an error body is never printed whole, in case it echoes what
 * was sent - which, for the child's door, includes the PIN.
 */
async function errorCode(res: APIResponse): Promise<string> {
  if (res.ok()) return "";
  const parsed = (await res.json().catch(() => null)) as {
    detail?: { code?: unknown };
  } | null;
  const code = parsed?.detail?.code;
  return typeof code === "string" ? ` ${code}` : "";
}

test.describe("a signed-in student", () => {
  test.describe.configure({ timeout: 150_000, mode: "serial" });

  test.beforeAll(async ({ playwright }) => {
    const api = await playwright.request.newContext();

    const admin = await api.post(`${API}/api/v1/auth/login/password`, {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(admin.ok(), `The E2E admin could not sign in (${admin.status()}).`).toBeTruthy();
    const adminBody = await admin.json();
    const auth = { Authorization: `Bearer ${adminBody.accessToken}` };

    const me = await api.get(`${API}/api/v1/users/me`, { headers: auth });
    expect(me.ok(), `Could not read the E2E admin's school (${me.status()}).`).toBeTruthy();
    schoolCode = String((await me.json()).school?.code ?? "");
    expect(schoolCode, "The E2E admin's school record carries no code.").not.toBe("");

    const listed = await api.get(`${API}/api/v1/students`, { headers: auth });
    expect(listed.ok(), `Could not list the tenant's students (${listed.status()}).`).toBeTruthy();
    const raw = await listed.json();
    const rows: { id: string; loginIdentifier?: string }[] = Array.isArray(raw)
      ? raw
      : (raw.items ?? raw.students ?? []);
    const student = rows.find((s) => s.loginIdentifier === STUDENT_LOGIN);
    expect(
      student,
      `No student with login ${STUDENT_LOGIN} in the E2E tenant.`,
    ).toBeTruthy();

    /*
     * The child's teacher clears and the child sets - the admin clears only
     * until the teacher secrets exist. See "Where the credential comes from".
     * The clear comes first because the child's door refuses a child who
     * still has a PIN.
     */
    let clearer = auth;
    let who = "The admin";
    if (TEACHER_EMAIL && TEACHER_PASSWORD) {
      const teacher = await api.post(`${API}/api/v1/auth/login/password`, {
        data: { email: TEACHER_EMAIL, password: TEACHER_PASSWORD },
      });
      expect(teacher.ok(), `The E2E teacher could not sign in (${teacher.status()}).`).toBeTruthy();
      clearer = { Authorization: `Bearer ${(await teacher.json()).accessToken}` };
      who = "The E2E teacher";
    }
    const cleared = await api.post(
      `${API}/api/v1/students/${student!.id}/pin/clear`,
      { headers: clearer },
    );
    expect(
      cleared.ok(),
      `${who} could not clear the probe's PIN (${cleared.status()}${await errorCode(cleared)}).` +
        (cleared.status() === 404
          ? who === "The admin"
            ? " If backend has taken admin access off pin/clear, set E2E_TEACHER_EMAIL and E2E_TEACHER_PASSWORD to a teacher of the probe's class."
            : " The teacher must teach one of the probe's classes."
          : ""),
    ).toBeTruthy();

    pin = String(randomInt(10_000)).padStart(4, "0");
    const entry = await api.post(`${API}/api/v1/student-entry/pin`, {
      data: { schoolCode, admissionNumber: STUDENT_ADMISSION, pin },
    });
    expect(
      entry.ok(),
      `The probe could not set its own PIN (${entry.status()}${await errorCode(entry)}). Its PIN stays cleared until a run sets one. Check that E2E_STUDENT_ADMISSION is the Student ID of ${STUDENT_LOGIN}.`,
    ).toBeTruthy();
    const body: {
      userId: string;
      session: { accessToken: string; expiresAt: string; userId: string; role: string };
    } = await entry.json();
    expect(
      body.userId,
      `E2E_STUDENT_ADMISSION is not the Student ID of ${STUDENT_LOGIN}: the door set a PIN for a different child, who now needs an admin to clear it. Fix the pair before the next run.`,
    ).toBe(student!.id);
    expect(body.session.role, "The E2E probe account must be a student").toBe("student");
    session = {
      token: body.session.accessToken,
      expiresAt: body.session.expiresAt,
      userId: body.session.userId,
      role: body.session.role,
    };

    /*
     * Where the sign-in door should send this child. A read that fails HOLDS
     * them (D69: "a check that cannot complete must not leave the door
     * open") - the product makes that call in `entryGate`, and the test has
     * to agree with it rather than with a guess. It used to read a failure as
     * not blocked, which is the rule design reversed.
     */
    const gate = await api.get(`${API}/api/v1/students/me/consent-gate`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    if (!gate.ok()) {
      consentDoor = "unread";
    } else {
      const answer = (await gate.json()) as {
        blocked?: unknown;
        status?: unknown;
      };
      consentDoor = !answer.blocked
        ? "open"
        : answer.status === "withdrawn"
          ? "withdrawn"
          : "waiting";
    }

    /*
     * What this child actually has, on their own session - the same two reads
     * the console makes. Kept even when they fail: each test that needs one
     * says so in its own words (see "What the child has is asked").
     */
    dashboardRead = await readJson<ProbeDashboard>(
      api,
      `${API}/api/v1/students/me/dashboard`,
      session.token,
    );
    progressRead = await readJson<ProbeProgress>(
      api,
      `${API}/api/students/${session.userId}/progress`,
      session.token,
    );

    await api.dispose();
  });

  test("the detector can see fixtures at all - the failure it exists to catch", async ({
    page,
  }) => {
    /*
     * THE POSITIVE CONTROL, and without it every test below could pass
     * vacuously. Each asserts "no sample marks"; if `data-nevo-sample` stopped
     * rendering entirely - an attribute renamed, a wrapper deleted - they would
     * all still pass, and so would every "no fixtures" test in the teacher and
     * admin suites. Nothing anywhere asserted a mark was ever PRESENT.
     *
     * So this reproduces the exact degradation the suite is for. The proxy
     * trusts the role cookie; the client reads the token from localStorage.
     * A page the proxy let through that the client then finds signed out
     * mounts the walkthrough's invented week. That must be visible to the same
     * selector the tests below rely on.
     *
     * THE COOKIE IS SENT, THEN TAKEN BACK. Since 1 Oct (#624) a page that loads
     * on a role cookie with no session behind it clears the cookie and sends
     * the child to the PIN door - the fix for the very state this used to
     * reach by planting the cookie alone. So the cookie goes with the document
     * request, which is all the proxy reads, and an init script deletes it
     * before the app's first line runs. The client then sees no cookie and no
     * session, which is an ordinary signed-out visit, and renders the samples.
     *
     * Waited for, not slept on: the marks appear once the client knows nobody
     * is signed in, and this waits for exactly that.
     */
    await page.context().addCookies([
      { name: ROLE_COOKIE, value: "student", url: "http://localhost:3100" },
    ]);
    await page.addInitScript((name) => {
      document.cookie = `${name}=; Max-Age=0; path=/`;
    }, ROLE_COOKIE);
    await page.goto("/student/dashboard");

    await expect(
      page.locator(`[${SAMPLE_ATTR}]`).first(),
      "A student console with no session rendered NO sample marks. Either the fixtures stopped being marked, or the detector is blind - and every 'no fixtures' assertion in this file would pass regardless.",
    ).toBeAttached({ timeout: LIVE_MS });
  });

  /*
   * The assertion this file exists for, one page per test so a failure names
   * the page rather than "somewhere in the console". The five tabs the nav
   * draws, and Profile, which the child's own disc opens.
   *
   * `ready` is each route's own resolved state - see "Waiting on the page".
   * Where the API says a lesson is set, the pages that list lessons must show
   * it: a list that resolved empty while the child has lessons is not live.
   */
  const TABS: {
    path: string;
    viewport?: { width: number; height: number };
    ready: (page: Page) => Promise<void>;
  }[] = [
    { path: "/student/dashboard", ready: homeResolved },
    {
      path: "/student/lessons",
      ready: async (page) => {
        await resolvedLive(
          "Lessons",
          page
            .getByRole("textbox", { name: "Search lessons" })
            .or(page.getByRole("heading", { name: "Your lessons will show up here soon" })),
          page.getByText(/We couldn.t load your lessons just now/),
        );
        await showsAListedLesson(page, "Lessons");
      },
    },
    {
      path: "/student/progress",
      ready: async (page) => {
        await resolvedLive(
          "Progress",
          page
            .locator('main a[href^="/student/progress/"]')
            .or(
              page.getByRole("heading", {
                name: "Your progress will show here as you complete lessons",
              }),
            )
            // The backend's reflection, which the live screen sets directly
            // under the heading; the skeleton puts a block there instead. It is
            // the whole live state for a child with lessons but no subject yet.
            .or(page.locator("main h1 + p")),
          page.getByText(/We couldn.t load your progress just now/),
        );
        const subject = firstSubject();
        if (subject) {
          await expect(
            page.locator(`main a[href="${subjectHref(subject.name)}"]`),
            `Progress did not show ${subject.name}, which the API names for this child.`,
          ).toBeVisible();
        }
      },
    },
    {
      path: "/student/downloads",
      ready: async (page) => {
        // The real shelf's own line: the signed-out simulation has none, and
        // the shell before hydration has only a heading.
        await expect(
          page.getByText(/Save a lesson while you.re connected/),
        ).toBeVisible({ timeout: LIVE_MS });
        await showsAListedLesson(page, "Downloads");
      },
    },
    {
      path: "/student/connect",
      // Read-only only at this width - see "What this file writes".
      viewport: PHONE,
      ready: (page) =>
        resolvedLive(
          "Connect",
          // A conversation row. Every row carries `aria-current`.
          page
            .locator("main button[aria-current]")
            .or(
              page.getByRole("heading", {
                name: "Your teacher will be able to message you here soon",
              }),
            ),
          page.getByText(/We couldn.t load your messages/),
        ),
    },
    { path: "/student/profile", ready: profileResolved },
  ];

  for (const tab of TABS) {
    test(`shows no fixture data on ${tab.path}`, async ({ page }) => {
      const writes = recordWrites(page);
      if (tab.viewport) await page.setViewportSize(tab.viewport);
      await plantSession(page);
      await page.goto(tab.path);
      await tab.ready(page);

      await expectNoSampleMarks(page, tab.path);
      expectNoWrites(writes, tab.path);
    });
  }

  test("shows no fixture data inside the notification bell", async ({ page }) => {
    /*
     * The bell was the one surface the sweep above could not see: its sample
     * mark only renders while the panel is OPEN, and the shell mounts it
     * outside both of its own marked regions. It was inventing "Ms Okafor sent
     * you a message" for signed-in children until it was found by reading the
     * file. So it is opened here rather than trusted.
     */
    const writes = recordWrites(page);
    await plantSession(page);
    await page.goto("/student/dashboard");
    await homeResolved(page);

    await page.getByRole("button", { name: "Notifications" }).first().click();
    await expect(page.getByRole("dialog", { name: "Notifications" })).toBeVisible();

    await expectNoSampleMarks(page, "The bell");
    expectNoWrites(writes, "Opening the bell");
  });

  test("Ask Nevo opens on a real session and shows no fixture data, without being asked anything", async ({
    page,
  }) => {
    /*
     * OPENED, NEVER ASKED. A question spends the child's daily allowance and
     * creates a conversation in their history. The canned reply that used to
     * reach a signed-in child was marked `student:ask-nevo`; this checks the
     * drawer a real child opens carries no mark and offers what only a session
     * can - their past conversations.
     */
    const writes = recordWrites(page);
    await plantSession(page);
    await page.goto("/student/dashboard");
    await homeResolved(page);

    await page.getByRole("button", { name: "Ask Nevo", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "Ask Nevo" });
    await expect(drawer.getByRole("textbox", { name: "Ask a question" })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Past conversations" })).toBeVisible();

    await expectNoSampleMarks(page, "Ask Nevo");
    expectNoWrites(writes, "Opening Ask Nevo");
  });

  test("Choose your look opens on a real session, and nothing is chosen", async ({
    page,
  }) => {
    // The sheet is portalled out of the page, so it marks itself when its
    // region is a fixture one. A signed-in child's must carry nothing.
    const writes = recordWrites(page);
    await plantSession(page);
    await page.goto("/student/profile");
    await profileResolved(page);

    await page.getByRole("button", { name: "Choose your look" }).click();
    const sheet = page.getByRole("dialog", { name: "Choose your look" });
    await expect(sheet).toBeVisible();

    await expectNoSampleMarks(page, "Choose your look");
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    expectNoWrites(writes, "Choose your look");
  });

  test("Change PIN shows only its first step, and nothing is submitted", async ({
    page,
  }) => {
    // Reached the way a child reaches it, from Profile: that link is the one
    // `!sso` hides, and a real session is what decides it.
    const writes = recordWrites(page);
    await plantSession(page);
    await page.goto("/student/profile");
    await profileResolved(page);

    await page.getByRole("button", { name: "Change PIN" }).click();
    await expect(page).toHaveURL(/\/student\/profile\/pin$/);
    await expect(page.getByRole("heading", { name: "Enter your current PIN" })).toBeVisible();
    await expect(page.getByText("Step 1 of 3")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();

    await expectNoSampleMarks(page, "Change PIN");
    expectNoWrites(writes, "Change PIN");
  });

  test("Feedback renders on a real session, and nothing is sent", async ({ page }) => {
    // Rendered only. A sent note lands in Nevo's own inbox, where a person
    // reads it.
    const writes = recordWrites(page);
    await plantSession(page);
    await page.goto("/student/profile");
    await profileResolved(page);

    await page.getByRole("button", { name: "Tell us something" }).click();
    await expect(page).toHaveURL(/\/student\/profile\/feedback$/);
    await expect(page.getByPlaceholder("Tell us what you think...")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send Feedback" })).toBeDisabled();

    await expectNoSampleMarks(page, "Feedback");
    expectNoWrites(writes, "Feedback");
  });

  test("shows a real subject's own detail, not a fixture one", async ({ page }) => {
    const subject = firstSubject();
    test.skip(
      !subject,
      "The probe's progress read names no subject, so there is no subject of theirs to open.",
    );

    const writes = recordWrites(page);
    await plantSession(page);
    await page.goto(subjectHref(subject!.name));
    await resolvedLive(
      `${subject!.name}'s detail`,
      page.getByRole("heading", { level: 1, name: subject!.name, exact: true }),
      page.getByText(/We couldn.t load (this|your lessons) just now/),
    );
    await expect(
      page.getByText(subject!.concept, { exact: true }).first(),
      `${subject!.name} did not show ${subject!.concept}, which the API says this child worked on.`,
    ).toBeVisible();

    await expectNoSampleMarks(page, `${subject!.name}'s detail`);
    expectNoWrites(writes, `${subject!.name}'s detail`);
  });

  test("the warm-up shows the engine's task or its nothing-state, and is never sat", async ({
    page,
  }) => {
    /*
     * NEVER SAT. Finishing it reduces the run to a feature vector and submits
     * it as a measurement of this child, which the engine recalibrates on. So
     * this opens it, looks, and touches nothing.
     *
     * Settled on the engine's own answer, the read the route makes to learn
     * what today's task is. When that read fails the screen shows the
     * nothing-state too, so a failed read fails here rather than passing as
     * "the engine named none".
     */
    const writes = recordWrites(page);
    await plantSession(page);
    const prompt = page.waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        /\/api\/baseline\/recalibrate-prompt\/[^/]+$/.test(new URL(r.url()).pathname),
      { timeout: LIVE_MS },
    );
    await page.goto("/student/warm-up");
    const answer = await prompt;
    expect(
      answer.ok(),
      `The engine's warm-up read failed (${answer.status()}), so the screen's nothing-state says nothing about the engine.`,
    ).toBeTruthy();
    const said = (await answer.json().catch(() => ({}))) as {
      dimension?: unknown;
      doneToday?: unknown;
    };
    // Recorded, so a green run says which of its states the route was in.
    // Whether a task was named, never which: that is the engine's business.
    test.info().annotations.push({
      type: "warm-up",
      description:
        said.doneToday === true
          ? "done today"
          : typeof said.dimension === "string"
            ? "the engine named a task"
            : "the engine named no task",
    });

    /*
     * THE ONE FIXED WAIT IN THIS FILE, and it guards two absences that no
     * element can announce. The engine's answer has just arrived; what the
     * page does with it comes a moment later. When the engine names no task
     * the screen does not change at all - the nothing-state was already up -
     * so there is nothing to wait FOR, only things that must not happen: a
     * task the engine never named appearing in its place (the weekday
     * rotation used to fill exactly this gap, and submit it), and a write.
     */
    await page.waitForTimeout(1_000);

    await expect(page.getByText("DAILY WARM-UP")).toBeVisible();
    if (said.doneToday === true) {
      await expect(page.getByRole("heading", { name: "That's it for today" })).toBeVisible();
    } else if (typeof said.dimension !== "string") {
      // No task named: the nothing-state, whose only control is the way Home.
      await expect(page.getByRole("button", { name: "Home", exact: true })).toBeVisible();
      await expect(page.getByRole("button")).toHaveCount(1);
    }

    await expectNoSampleMarks(page, "The warm-up");
    expectNoWrites(writes, "Opening the warm-up");
  });

  test("the waiting screen renders for a signed-in child, as a hold and not a tab", async ({
    page,
  }) => {
    /*
     * 00d is reachable by its address, because four doors send a held child
     * there. Whether THIS child is held is the sign-in test's question; this
     * one asks that the hold itself renders, with its logo, and bare: no
     * navigation and no Ask Nevo to tap past it with.
     */
    const writes = recordWrites(page);
    await plantSession(page);
    await page.goto("/student/waiting");
    await expect(
      page.getByRole("heading", { name: "Nevo isn't quite ready for you yet" }),
    ).toBeVisible({ timeout: LIVE_MS });
    await expect(page.getByRole("img", { name: "Nevo" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Lessons" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Ask Nevo" })).toHaveCount(0);

    await expectNoSampleMarks(page, "The waiting screen");
    expectNoWrites(writes, "The waiting screen");
  });

  test("a lesson that does not exist says so in frame 28's words, not the app's 404", async ({
    page,
  }) => {
    /*
     * Only a real backend can say "no such lesson". The route is a thin shell
     * - the server cannot read the token - so the document is a 200 and the
     * answer arrives from the live read. A 404 there must reach the child as
     * frame 28's "We couldn't open that lesson." (D90, 6 Oct), with the one
     * way back to their lessons, never as the app's "This page doesn't
     * exist", which is written for a developer.
     */
    const writes = recordWrites(page);
    await plantSession(page);
    const response = await page.goto(`/student/lessons/${MISSING_LESSON}`);
    expect(response?.status(), "The lesson route answered the document itself with an error.").toBe(200);

    const missing = page.getByRole("heading", { name: /We couldn.t open that lesson/ });
    const failed = page.getByRole("heading", { name: /Something went wrong/ });
    await expect(missing.or(failed).first()).toBeVisible({ timeout: LIVE_MS });
    await expect(
      failed,
      "An unknown lesson id came back as a failed read, not a 404: the backend's answer for a missing lesson has changed.",
    ).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "This page doesn't exist" })).toHaveCount(0);

    await expectNoSampleMarks(page, "A missing lesson");
    expectNoWrites(writes, "A missing lesson");

    await page.getByRole("button", { name: "Back to lessons" }).click();
    await expect(page).toHaveURL(/\/student\/lessons$/);
  });

  test("the summary of a lesson the child finished renders live", async ({ page }) => {
    const done = finishedLesson();
    test.skip(!done, "The probe has not finished a lesson, so there is no summary of theirs to open.");

    const writes = recordWrites(page);
    await plantSession(page);
    await page.goto(`/student/lessons/${done!.lessonId}/summary`);
    /*
     * Two live answers: the lesson's summary under its own title, or - for a
     * lesson that carries none - the player's own gate, "isn't ready yet". The
     * failed and missing reads are the other headings this route can draw.
     */
    const heading = page.locator("main h1");
    await expect(heading).toBeVisible({ timeout: LIVE_MS });
    await expect(
      heading,
      `The summary of "${done!.title}" did not render: the lesson read failed or came back missing.`,
    ).toHaveText(
      new RegExp(`^\\s*(${literal(done!.title.trim())}|This lesson isn.t ready yet)\\s*$`),
    );

    await expectNoSampleMarks(page, "The lesson summary");
    expectNoWrites(writes, "The lesson summary");
  });

  test("the answers review of a lesson the child finished renders live", async ({
    page,
  }) => {
    const done = finishedLesson();
    test.skip(!done, "The probe has not finished a lesson, so there are no answers of theirs to review.");

    const writes = recordWrites(page);
    await plantSession(page);
    await page.goto(`/student/lessons/${done!.lessonId}/review`);
    await resolvedLive(
      "The answers review",
      page.getByRole("heading", { name: "A look back at the check-in" }),
      // Every other heading this route can draw: the read failed, came back
      // missing, or came back with nothing in it.
      page.getByRole("heading", {
        name: /We couldn.t (open this just now|find that lesson)|isn.t ready yet/,
      }),
    );

    await expectNoSampleMarks(page, "The answers review");
    expectNoWrites(writes, "The answers review");
  });

  test("opens a lesson set for the child, shows the segment it opens on, and leaves by the lesson's own exit", async ({
    page,
  }) => {
    /*
     * THE ONE TEST HERE THAT WRITES TO THE CHILD'S LEARNING, and only what
     * opening and leaving writes - see "What this file writes". It never moves
     * forward, never answers anything, and leaves straight away.
     */
    const lesson = lessonToOpen();
    test.skip(!lesson, "The probe has no lesson set and open to them, so there is nothing to play.");

    const writes = recordWrites(page);
    await plantSession(page);
    // The link the child's own card uses: the assignment rides along.
    const response = await page.goto(
      `/student/lessons/${lesson!.lessonId}?assignment=${encodeURIComponent(lesson!.assignmentId)}`,
    );
    expect(response?.status(), "A real lesson answered its hard load with an error.").toBe(200);

    // The segment the player opens on is a group named by its position.
    const segment = page.getByRole("group", { name: /Segment \d+ of \d+/ });
    const notPlayed = page.getByRole("heading", {
      name: /Something went wrong|isn.t (ready yet|open yet|on your list)|couldn.t find that lesson/,
    });
    await expect(segment.or(notPlayed).first()).toBeVisible({ timeout: LIVE_MS });
    await expect(
      notPlayed,
      `"${lesson!.title}" did not open in the player.`,
    ).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1, name: lesson!.title })).toBeVisible();
    // IA 31: never available while the player is teaching.
    await expect(page.getByRole("button", { name: "Ask Nevo" })).toHaveCount(0);
    await expectNoSampleMarks(page, "The lesson player");

    await page.getByRole("button", { name: "Exit lesson" }).click();
    const leave = page.getByRole("dialog");
    await expect(leave).toBeVisible();
    await leave.getByRole("button", { name: "Leave for now", exact: true }).click();
    await expect(page).toHaveURL(/\/student\/dashboard/, { timeout: LIVE_MS });

    // Recorded, so a green run says exactly what it wrote.
    test.info().annotations.push({
      type: "writes",
      description: described(writes).join(", ") || "none",
    });
    const finishing = writes.filter(
      (w) =>
        /\/lessons\/[^/]+\/attempts$/.test(w.path) ||
        /\/scheduler\/record-review$/.test(w.path) ||
        /\/guided-questions\/answer$/.test(w.path) ||
        (/\/lessons\/[^/]+\/progress$/.test(w.path) &&
          (w.body as { status?: unknown } | null)?.status === "completed"),
    );
    expect(
      described(finishing),
      "Opening and leaving a lesson finished it or answered something in it.",
    ).toEqual([]);
  });

  test("signs in through the real door, and lands where consent says", async ({
    page,
  }) => {
    /*
     * LAST ON PURPOSE: the session this creates replaces the one every other
     * test planted.
     *
     * Everything above plants a session. This one types the PIN `beforeAll`
     * set, the way a child on a school laptop does - which is also the path
     * that could not take a keystroke until 18 Sep, because the PIN field was
     * never focused.
     *
     * And it lands through `entryGate`, so it checks the consent wiring end to
     * end: a child the server says may not proceed is held at the waiting
     * screen, whichever door they used.
     */
    await page.goto("/auth/sign-in");

    await page.getByRole("textbox", { name: "School code" }).fill(schoolCode);
    await page.locator("#returning-username").fill(STUDENT_LOGIN!);
    await page
      .locator('input[aria-labelledby="returning-pin-label"]')
      .pressSequentially(pin);
    // 00c's label for the button (it read "Sign in" until 1 Oct).
    await page.getByRole("button", { name: "That's me" }).click();

    /*
     * The session `beforeAll` was given when the probe chose its PIN is still
     * live, so this sign-in replaces it, and the door says so on its own
     * screen before going on (frame 28, D59, 6 Oct). Asserted rather than
     * skipped past: a replaced session that went unannounced would be a
     * regression too.
     */
    await expect(
      page.getByText("You were signed in on another device, so that one signed out."),
    ).toBeVisible({ timeout: LIVE_MS });
    await page.getByRole("button", { name: "Continue" }).click();

    // Recorded, so a green run says WHICH door this child was sent through.
    test.info().annotations.push({
      type: "consent",
      description: `${consentDoor} - expected ${CONSENT_LANDING[consentDoor]}`,
    });

    await expect(page).toHaveURL(CONSENT_LANDING[consentDoor], {
      timeout: LIVE_MS,
    });
  });
});
