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
 * The classes this spec probes may still be empty; it does not assume either
 * way, and nothing below depends on the count.
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

/** The class the E2E school actually holds. Overridable per tenant. */
const CLASS_NAME = process.env.E2E_CLASS_NAME ?? "E2E Probe Class";

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
async function signInAsTeacher(page: Page, request: APIRequestContext) {
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
}

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

  test.beforeEach(async ({ page, request }) => {
    await signInAsTeacher(page, request);
  });

  test("reaches the dashboard instead of the door", async ({ page }) => {
    await page.goto("/teacher/dashboard");
    await expect(page).toHaveURL(/\/teacher\/dashboard/);
  });

  test("sees their OWN class, not a fixture one", async ({ page }) => {
    // The fixture classes are named JSS 2A and similar. A real read returns the
    // E2E school's own class, so the name is the tell.
    await page.goto("/teacher/classes");
    await settled(page, CLASS_NAME);
    // And the school line is the tenant's own, not the fixture school.
    await expect(page.getByText(/Corona Secondary School/)).toHaveCount(0);
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

  test("renders an honest empty roster rather than inventing children", async ({ page }) => {
    // The E2E class genuinely has no students. A console falling back to
    // fixtures would show six, with seat numbers and glance dots.
    await page.goto("/teacher/classes");
    await settled(page, CLASS_NAME);
    await page.getByText(CLASS_NAME).first().click();
    await page.waitForTimeout(3_000);

    expect(await sampleMarks(page)).toEqual([]);
    // Fixture rosters are full of these names; a real empty class has none.
    await expect(page.getByText(/Amina|Chidi|Tunde Bakare|Ngozi/)).toHaveCount(0);
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
