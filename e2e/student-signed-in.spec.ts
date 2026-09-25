import { expect, test, type Page } from "@playwright/test";

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
 * A child signs in with school code + login identifier + PIN. There is no safe
 * way to keep a child's PIN in a secret store: it is four to eight digits, it is
 * reset by an adult, and it is the one credential a child is told out loud. So
 * this suite MINTS one: it signs in as the E2E admin, calls
 * `POST /api/v1/students/{id}/pin/reset` for the probe student, and uses the
 * PIN that comes back. Confirmed against the live tenant on 24 Sep.
 *
 * **Running it CHANGES that student's PIN**, which is why the student is named
 * explicitly rather than defaulted: the write is opt-in. Point it at a probe
 * account nobody reads by hand.
 *
 * ## Why the PIN is minted ONCE
 *
 * Each reset changes the PIN, and each `POST /auth/login/pin` issues a session
 * that REPLACES the last one (`replacedSession`). Minting per test would churn
 * both and invite the rate limit that `too_many_attempts` exists for. So one
 * reset and one sign-in in `beforeAll`; every test plants that same session;
 * and the one test that drives the real sign-in form runs LAST, because the
 * session it creates replaces the planted one.
 *
 * ## The coupling this catches
 *
 * An administrator's reset issues a SIX-digit PIN. If `STUDENT_PIN_LENGTH` is
 * lowered to four without the sign-in form accepting up to eight, a child whose
 * PIN was reset by an adult could not type it in. The form test below would
 * fail on exactly that.
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const STUDENT_LOGIN = process.env.E2E_STUDENT_LOGIN;
const SCHOOL_CODE = process.env.E2E_SCHOOL_CODE ?? "NEVO-E2E";
const API = process.env.E2E_API_BASE ?? "https://api.nevolearning.com";

/** Mirrors `lib/auth/session.ts`. Changing either without the other breaks this. */
const SESSION_KEY = "nevo.auth.session";
const ROLE_COOKIE = "nevo.role";
const SAMPLE_ATTR = "data-nevo-sample";

test.skip(
  !ADMIN_EMAIL || !ADMIN_PASSWORD || !STUDENT_LOGIN,
  "Set E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD and E2E_STUDENT_LOGIN to run the student suite. It resets that student's PIN.",
);

/** How long a live read may take before we call it broken. See the teacher suite. */
const LIVE_MS = 30_000;

interface StudentSession {
  token: string;
  expiresAt: string;
  userId: string;
  role: string;
}

/** Set once in `beforeAll`. */
let pin = "";
let session: StudentSession;
/**
 * Whether the server says this child may proceed. Read once so the sign-in
 * test knows which door is the right one - the dashboard, or the waiting
 * screen - rather than asserting one and failing on the other.
 */
let consentBlocked = false;

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

/** The shell is mounted once the nav is; `.first()` because it renders per breakpoint. */
async function shellMounted(page: Page) {
  await expect(page.getByRole("link", { name: "Lessons" }).first()).toBeVisible({
    timeout: LIVE_MS,
  });
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

    const reset = await api.post(
      `${API}/api/v1/students/${student!.id}/pin/reset`,
      { headers: auth },
    );
    expect(reset.ok(), `The PIN reset was refused (${reset.status()}).`).toBeTruthy();
    pin = String((await reset.json()).pin);
    expect(pin, "The reset returned no PIN.").toMatch(/^\d+$/);

    const login = await api.post(`${API}/api/v1/auth/login/pin`, {
      data: { schoolCode: SCHOOL_CODE, loginIdentifier: STUDENT_LOGIN, pin },
    });
    expect(
      login.ok(),
      `The minted PIN did not sign the student in (${login.status()}).`,
    ).toBeTruthy();
    const body = await login.json();
    expect(body.role, "The E2E probe account must be a student").toBe("student");
    session = {
      token: body.accessToken,
      expiresAt: body.expiresAt,
      userId: body.userId,
      role: body.role,
    };

    /*
     * Where the sign-in door should send this child. A read that fails is NOT
     * treated as blocked - the product makes the same call in `entryGate`, and
     * the test has to agree with it rather than with a guess.
     */
    const gate = await api.get(`${API}/api/v1/students/me/consent-gate`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    consentBlocked = gate.ok() ? Boolean((await gate.json()).blocked) : false;

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
     * Cookie without session means the proxy lets the child through and the
     * console mounts signed-out - and renders the walkthrough's invented week.
     * That must be visible to the same function the tests below rely on.
     */
    await page.context().addCookies([
      { name: ROLE_COOKIE, value: "student", url: "http://localhost:3100" },
    ]);
    await page.goto("/student/dashboard");
    await shellMounted(page);
    await page.waitForTimeout(2_000);

    const marks = await sampleMarks(page);
    expect(
      marks.length,
      "A student console with no session rendered NO sample marks. Either the fixtures stopped being marked, or the detector is blind - and every 'no fixtures' assertion in this file would pass regardless.",
    ).toBeGreaterThan(0);
  });

  /*
   * The assertion this file exists for, one page per test so a failure names
   * the page rather than "somewhere in the console".
   */
  for (const path of [
    "/student/dashboard",
    "/student/lessons",
    "/student/progress",
    "/student/connect",
    "/student/profile",
  ]) {
    test(`shows no fixture data on ${path}`, async ({ page }) => {
      await plantSession(page);
      await page.goto(path);
      await shellMounted(page);
      await page.waitForTimeout(2_000);

      const marks = await sampleMarks(page);
      expect(marks, `${path} rendered fixture data: ${marks.join(", ")}`).toEqual([]);
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
    await plantSession(page);
    await page.goto("/student/dashboard");
    await shellMounted(page);

    await page.getByRole("button", { name: "Notifications" }).first().click();
    await page.waitForTimeout(2_000);

    const marks = await sampleMarks(page);
    expect(marks, `the bell rendered fixture data: ${marks.join(", ")}`).toEqual([]);
  });

  test("signs in through the real door, and lands where consent says", async ({
    page,
  }) => {
    /*
     * LAST ON PURPOSE: the session this creates replaces the one every other
     * test planted.
     *
     * Everything above plants a session. This one types, the way a child on a
     * school laptop does - which is also the path that could not take a
     * keystroke until 18 Sep, because the PIN field was never focused.
     *
     * And it lands through `entryGate`, so it checks the consent wiring end to
     * end: a child the server says may not proceed is held at the waiting
     * screen, whichever door they used.
     */
    await page.goto("/auth/sign-in");

    await page.getByRole("textbox", { name: "School code" }).fill(SCHOOL_CODE);
    await page.locator("#returning-username").fill(STUDENT_LOGIN!);
    await page
      .locator('input[aria-labelledby="returning-pin-label"]')
      .pressSequentially(pin);
    await page.getByRole("button", { name: "Sign in" }).click();

    // Recorded, so a green run says WHICH door this child was sent through.
    test.info().annotations.push({
      type: "consent",
      description: consentBlocked
        ? "blocked - expected the waiting screen"
        : "not blocked - expected the dashboard",
    });

    await expect(page).toHaveURL(
      consentBlocked ? /\/student\/waiting/ : /\/student\/dashboard/,
      { timeout: LIVE_MS },
    );
  });
});
