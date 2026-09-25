import { expect, test, type Page, type APIRequestContext } from "@playwright/test";

/**
 * The teacher console, SIGNED IN.
 *
 * This is the first end-to-end test in the repo that holds a real session, and
 * the one property it exists for is the one no unit test can reach: that a
 * signed-in teacher is never shown invented data.
 *
 * WHY THAT IS THE ASSERTION. Every console in this product is live-first with a
 * fixture fallback, which is deliberate for the signed-out walkthrough and is
 * exactly what makes an end-to-end test dishonest: "the teacher signs in and
 * sees their class list" PASSES when the read 401s, because the fallback
 * renders a class list, which is what the assertion looks for. The suite goes
 * green while the console shows six invented children to a real person.
 *
 * `lib/sampleData.ts` exists for this: every fixture render carries
 * `data-nevo-sample`. So the test does not ask "is there a class list" - it
 * asks "is anything on this page a fixture", which is the question that cannot
 * be satisfied by the failure mode.
 *
 * THE EMPTY TENANT WAS THE POINT, AND THE TENANT IS NO LONGER EMPTY.
 * **Corrected 24 Sep:** this said the E2E school held one class and no
 * students because `POST /api/v1/students` and `PATCH /students/{id}/class`
 * both 500. Checked against the live tenant: **7 classes and 39 students**
 * (`NV-E2E000` upward). Whether those 500s were fixed or the tenant was
 * seeded another way, the premise is gone.
 *
 * The REASONING it supported still holds and is why these assertions are
 * shaped as they are: fixture fallback is most dangerous where a console can
 * quietly render children who do not exist, so the test asks "is anything here
 * a fixture" rather than "is there a roster". That question does not get weaker
 * with real data - it gets sharper, because now both answers look plausible.
 *
 * NOTHING HERE IS NAMED IN ADVANCE ANY MORE - 25 Sep.
 *
 * The tenant was re-seeded, and the spec broke on three assumptions at once.
 * It looked for a class called "E2E Probe Class", which is gone. It proved a
 * class was real by its NAME - and the fixtures draw "JSS 2A" and "JSS 2B",
 * which are now real classes in this school. And it assumed an empty class to
 * test the honest empty roster, when every active class now holds five to
 * eight children.
 *
 * Its fixture-NAME check had the same flaw a second time: it asserted no
 * "Amina", "Chidi", "Tunde Bakare" or "Ngozi" appeared - and the E2E teacher
 * is Chidi Adeyemi, whose name the console shell shows, and one real child in
 * their classes matches that pattern too. Names cannot tell real from invented
 * once the real school uses the same names. `data-nevo-sample` can.
 *
 * So the spec now asks the API which classes this teacher has and how many
 * children are in each, using the test's own session, and asserts against
 * that. Which teacher CI signs in as is not decided yet - the secrets are not
 * set - so the suite cannot know a class name or a roster size in advance,
 * and does not try.
 *
 * CREDENTIALS COME FROM THE ENVIRONMENT, never the repo. Without them the suite
 * SKIPS rather than fails: a contributor without secrets should not see a red
 * run for a test that was never going to be able to sign in.
 *
 * SERIAL, AND THAT IS NOT A STYLE CHOICE. The project runs `fullyParallel`, and
 * these tests share ONE teacher account. `SessionResponse` carries
 * `replaced_session`: a second sign-in as the same user invalidates the first.
 * Run in parallel, a sibling test's login kills this one's session mid-walk and
 * the console bounces to the door - which looks exactly like a product bug and
 * is not one. It cost an hour to find, so: one account, one test at a time.
 */

const EMAIL = process.env.E2E_TEACHER_EMAIL;
const PASSWORD = process.env.E2E_TEACHER_PASSWORD;
const API = process.env.E2E_API_BASE ?? "https://api.nevolearning.com";

/** Mirrors `lib/auth/session.ts`. Changing either without the other breaks this. */
const SESSION_KEY = "nevo.auth.session";
const ROLE_COOKIE = "nevo.role";
const SAMPLE_ATTR = "data-nevo-sample";

test.skip(
  !EMAIL || !PASSWORD,
  "Set E2E_TEACHER_EMAIL and E2E_TEACHER_PASSWORD to run the signed-in suite.",
);

/**
 * Sign in through the API and plant the session before the app's first paint.
 *
 * `storageState` alone cannot carry this session: the token lives in
 * localStorage, which Playwright can restore, but the ROLE COOKIE is written by
 * the client at sign-in and `proxy.ts` reads it on the server to decide whether
 * to serve console markup at all. Restore one without the other and the guard
 * bounces you to the door before any page code runs.
 *
 * `addInitScript` rather than an `evaluate` after navigation: the session has to
 * exist before the first render, or the console mounts signed-out, decides it is
 * a guest, and renders the very fixtures this suite is checking for.
 */
async function signInAsTeacher(
  page: Page,
  request: APIRequestContext,
): Promise<string> {
  const res = await request.post(`${API}/api/v1/auth/login/password`, {
    data: { email: EMAIL, password: PASSWORD },
  });
  expect(
    res.ok(),
    `Could not sign the E2E teacher in (${res.status()}). Check the credentials in CI secrets.`,
  ).toBeTruthy();

  const body = await res.json();
  expect(body.role, "The E2E account must be a teacher").toBe("teacher");

  /*
   * camelCase, and this read snake_case until 16 Sep.
   *
   * `SessionResponse` is `{accessToken, tokenType, expiresAt, userId, role,
   * replacedSession}` - all six required, all six renamed in the backend's
   * 129-field sweep. This planted `token: undefined`, so the console mounted
   * signed-OUT and rendered the very fixtures this suite exists to assert the
   * absence of. It was invisible because the suite skips without credentials.
   *
   * `npm run contract` would not have caught it: that script scans `src/`,
   * which is the whole client and none of the tests.
   */
  const session = {
    token: body.accessToken,
    expiresAt: body.expiresAt,
    userId: body.userId,
    role: body.role,
  };
  expect(
    session.token,
    "The login response carried no accessToken - has SessionResponse changed again?",
  ).toBeTruthy();

  await page.context().addCookies([
    {
      name: ROLE_COOKIE,
      value: body.role,
      url: page.url().startsWith("http") ? page.url() : "http://localhost:3100",
    },
  ]);
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [SESSION_KEY, JSON.stringify(session)] as const,
  );
  // Returned so a test can ask the API what it should expect to see, on the
  // SAME session - a second sign-in would replace this one (`replacedSession`)
  // and bounce the page to the door mid-test.
  return session.token as string;
}

type RealClass = {
  id: string;
  name: string;
  /** Names as the roster route reports them - never the page's. */
  children: { firstName: string; displayName: string | null }[];
};

/**
 * WHAT THIS TEACHER ACTUALLY HAS, from the API rather than from this file.
 *
 * The answer the page is checked against. It is read on the test's own
 * session, and every class is read for its roster, because the roster size is
 * the thing the empty-state test needs and no list route carries it.
 */
async function realClasses(
  request: APIRequestContext,
  token: string,
): Promise<RealClass[]> {
  const auth = { Authorization: `Bearer ${token}` };
  const res = await request.get(`${API}/api/v1/teachers/me/classes`, {
    headers: auth,
  });
  expect(res.ok(), `Could not list the teacher's classes (${res.status()}).`).toBeTruthy();
  const listed: { classId: string; className: string }[] = await res.json();

  return Promise.all(
    listed.map(async (c) => {
      const r = await request.get(`${API}/api/v1/classes/${c.classId}/students`, {
        headers: auth,
      });
      const body = r.ok() ? await r.json() : [];
      const rows = Array.isArray(body) ? body : (body.items ?? body.students ?? []);
      return {
        id: c.classId,
        name: c.className,
        children: rows.map((row: { firstName?: string; displayName?: string | null }) => ({
          firstName: row.firstName ?? "",
          displayName: row.displayName ?? null,
        })),
      };
    }),
  );
}

/** A class name as a literal inside a pattern - "SS 2A (2025/26)" has three specials. */
const literal = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/**
 * How long a live read may take before we call it broken.
 *
 * Generous on purpose: these tests drive a cold production build against the
 * REAL API over the internet. The first version used 5s and
 * `waitForLoadState("networkidle")`, and failed on both counts - 5s caught the
 * page mid-load, and networkidle never settles in a Next app that polls. The
 * failure looked like a fixture-data bug and was not one.
 */
const LIVE_MS = 30_000;

/**
 * Wait for the console to have finished its live reads, by waiting for
 * something only a real read can produce. Never `networkidle`.
 */
async function settled(page: Page, realText: string | RegExp) {
  await expect(page.getByText(realText).first()).toBeVisible({ timeout: LIVE_MS });
}

/** Every fixture render in the product carries this. Signed in, there must be none. */
async function sampleMarks(page: Page): Promise<string[]> {
  return page.locator(`[${SAMPLE_ATTR}]`).evaluateAll((nodes) =>
    nodes.map((n) => n.getAttribute("data-nevo-sample") ?? "unknown"),
  );
}

test.describe("a signed-in teacher", () => {
  /**
   * Longer than the 30s default in `playwright.config.ts`, which is tuned for
   * the signed-out specs against static pages. These sign in over the internet
   * and then walk five console pages, each waiting on its own live read - the
   * default is not a meaningful budget for that, and treating a slow API as a
   * test failure would make this suite flaky rather than useful.
   */
  test.describe.configure({ timeout: 150_000, mode: "serial" });

  let token = "";

  test.beforeEach(async ({ page, request }) => {
    token = await signInAsTeacher(page, request);
  });

  test("reaches the dashboard instead of the door", async ({ page }) => {
    await page.goto("/teacher/dashboard");
    await expect(page).toHaveURL(/\/teacher\/dashboard/);
  });

  test("sees their OWN class, not a fixture one", async ({ page, request }) => {
    /*
     * THE NAME IS NO LONGER THE TELL. This waited for "E2E Probe Class" on the
     * grounds that fixtures are named like JSS 2A - and after the re-seed the
     * school has a real JSS 2A. So the page is settled on any class the API
     * says this teacher has, and the proof it is not invented is the one the
     * failure mode cannot fake: no fixture marks anywhere on it.
     */
    const classes = await realClasses(request, token);
    test.skip(classes.length === 0, "This teacher has no classes to show.");

    await page.goto("/teacher/classes");
    await settled(page, new RegExp(classes.map((c) => literal(c.name)).join("|")));

    const marks = await sampleMarks(page);
    expect(marks, `The class list rendered fixture data: ${marks.join(", ")}`).toEqual([]);
    // A school name is still a fair tell: no real tenant is called this.
    await expect(page.getByText(/Corona Secondary School/)).toHaveCount(0);
  });

  test("shows a real class's real children", async ({ page, request }) => {
    /*
     * The case the old suite never had, because the tenant it was written for
     * held no children at all. A roster is where a fallback does the most harm
     * - it invents children, with seats and glance dots - so this settles on a
     * child the API says is in the class and then checks nothing else is.
     */
    const classes = await realClasses(request, token);
    const full = classes.find((c) => c.children.length > 0);
    test.skip(!full, "None of this teacher's classes has anyone in it.");

    const child = full!.children[0];
    await page.goto(`/teacher/classes/${full!.id}`);
    await settled(page, new RegExp(literal(child.firstName)));

    const marks = await sampleMarks(page);
    expect(marks, `${full!.name}'s roster rendered fixture data: ${marks.join(", ")}`).toEqual([]);
  });

  /**
   * The assertion this whole file exists for, ONE PAGE PER TEST.
   *
   * It began as a single test walking all five, which passed alone and failed
   * in the full suite - the session died partway and the console bounced to the
   * door, which reads as a fixture bug and is not one. A long test holding one
   * session across five navigations is hostage to that session's lifetime; five
   * short tests that each sign in fresh are not, and they name the page that
   * broke instead of "somewhere in the console".
   */
  for (const path of [
    "/teacher/dashboard",
    "/teacher/classes",
    "/teacher/lessons",
    "/teacher/insights",
    "/teacher/students",
  ]) {
    test(`shows no fixture data on ${path}`, async ({ page }) => {
      await page.goto(path);
      // Settle on the shell: every console page renders the nav, and it is
      // there only once the app has mounted. `.first()` guards strict mode -
      // the nav appears in more than one breakpoint tree.
      await expect(
        page.getByRole("link", { name: "Classes" }).first(),
      ).toBeVisible({ timeout: LIVE_MS });
      await page.waitForTimeout(2_000);

      const marks = await sampleMarks(page);
      expect(marks, `${path} rendered fixture data: ${marks.join(", ")}`).toEqual([]);
    });
  }

  test("renders an honest empty roster rather than inventing children", async ({ page, request }) => {
    /*
     * RUNS ONLY WHERE THERE IS AN EMPTY CLASS, and says so when there is not.
     * The re-seed left every active class with five to eight children, so on
     * that tenant this is a visible skip rather than a pass nobody earned.
     *
     * It asserts the NOTHING-STATE, not merely the absence of fixtures. The
     * same block says "We couldn't load this class's roster" when the read
     * fails - which also shows no children and no fixture marks - so a test
     * that only checked for absence would pass on a 500.
     *
     * The fixture-NAME check that was here is gone: the E2E teacher is called
     * Chidi, and the console shell shows it.
     */
    const classes = await realClasses(request, token);
    const empty = classes.find((c) => c.children.length === 0);
    test.skip(!empty, "No class of this teacher's is empty, so the empty roster cannot be reached live.");

    await page.goto(`/teacher/classes/${empty!.id}`);
    await settled(page, "Nobody has joined this class yet");

    await expect(page.getByText(/couldn.t load this class.s roster/i)).toHaveCount(0);
    expect(await sampleMarks(page)).toEqual([]);
  });

  test("never offers school SSO as though it worked", async ({ context }) => {
    // Signed out, on the door. The control stays, but tapping it must explain
    // rather than mime a handoff to a provider it cannot reach.
    await context.clearCookies();
    const fresh = await context.newPage();
    await fresh.goto("/auth/teacher");
    await fresh.getByRole("button", { name: /Continue with school SSO/i }).click();

    await expect(fresh.getByText(/isn't set up for Nevo yet/i)).toBeVisible();
    await expect(fresh).toHaveURL(/\/auth\/teacher$/);
    await fresh.close();
  });
});
