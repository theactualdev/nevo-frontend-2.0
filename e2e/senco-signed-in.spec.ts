import { appendFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { serverFailure } from "./serverFailure";

/**
 * Learning Support, signed in as an administrator who holds it.
 *
 * The admin suite can only prove the refusal. Its account holds every scope,
 * but Learning Support is a recorded grant rather than a scope (SCRUM-247), so
 * that account is refused it and `/admin/senco/{id}` must say NO ACCESS. Nothing
 * proved the other half - that a holder actually reads a learner's history -
 * and that is the half a school's SENCo lives in.
 *
 * Backend made this account for it on 14 Oct (Teslim, B1): a `senco_admin`
 * holding Learning Support, on the same E2E school as the other suites. Its
 * secrets existed from that afternoon, but no workflow passed them on and no
 * spec read them, so until this file CI never signed in as it.
 *
 * Same rules as the admin suite: a live figure reached the screen or no
 * invented one did, and no count is pinned - the seed is Teslim's to change.
 * A different account from the admin's, so signing in here kills no other
 * suite's session; the one-worker rule in the config still holds.
 *
 * THE SUITE SETS UP THE GRANT IT TESTS (Lydia, 28 Oct). On its first run the
 * account held no Learning Support, and a suite that depends on an account
 * anyone can edit by hand breaks again the next time someone touches it. So
 * `beforeAll` grants it when it is missing, as the E2E admin (any admin may
 * grant it to someone else, never to themselves), and says so on the run's
 * summary page - a missing grant is shown, not silently repaired.
 *
 * NOTHING HAD REVOKED IT (Teslim, 30 Oct). The E2E school holds two SENCo test
 * accounts. The one backend made for this suite on 14 Oct kept its grant
 * throughout. The only grant the other one ever got was this suite's own, on
 * 28 Oct, so that is the account the secret named: it had simply never held
 * Learning Support. When this setup grants, check which account
 * E2E_SENCO_EMAIL names before suspecting the permission check.
 */

const EMAIL = process.env.E2E_SENCO_EMAIL;
const PASSWORD = process.env.E2E_SENCO_PASSWORD;
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const API = process.env.E2E_API_BASE ?? "https://api.nevolearning.com";

/** Mirrors `lib/auth/session.ts`. Changing either without the other breaks this. */
const SESSION_KEY = "nevo.auth.session";
const ROLE_COOKIE = "nevo.role";
const SAMPLE_ATTR = "data-nevo-sample";

const LIVE = { timeout: 25_000 };

test.skip(
  !EMAIL || !PASSWORD,
  "Set E2E_SENCO_EMAIL and E2E_SENCO_PASSWORD to run the Learning Support suite.",
);

test.describe.configure({ mode: "serial" });

/** The signed-in holder's bearer token, for reading the API directly. */
let sencoToken = "";

/** A sign-in through the API alone, returning the session body. */
async function signIn(
  request: APIRequestContext,
  email: string,
  password: string,
  who: string,
) {
  const res = await request.post(`${API}/api/v1/auth/login/password`, {
    data: { email, password },
  });
  expect(
    res.ok(),
    `Could not sign the E2E ${who} in (${res.status()}).${(await serverFailure(res)) || " Check the credentials in CI secrets."}`,
  ).toBeTruthy();
  return (await res.json()) as {
    accessToken: string;
    expiresAt: string;
    userId: string;
    role: string;
  };
}

test.beforeAll(async ({ playwright }) => {
  if (!EMAIL || !PASSWORD) return;
  const request = await playwright.request.newContext();
  try {
    const senco = await signIn(request, EMAIL, PASSWORD, "SENCo");
    const holders = await request.get(`${API}/api/v1/learning-support/holders`, {
      headers: { Authorization: `Bearer ${senco.accessToken}` },
    });
    expect(
      holders.ok(),
      `GET /api/v1/learning-support/holders answered ${holders.status()}`,
    ).toBeTruthy();
    if (((await holders.json()) as { viewerHoldsIt: boolean }).viewerHoldsIt) return;

    expect(
      ADMIN_EMAIL && ADMIN_PASSWORD,
      "The E2E SENCo account holds no Learning Support, and granting it needs E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD.",
    ).toBeTruthy();
    const admin = await signIn(request, ADMIN_EMAIL as string, ADMIN_PASSWORD as string, "admin");
    const grant = await request.post(`${API}/api/v1/learning-support/holders`, {
      headers: { Authorization: `Bearer ${admin.accessToken}` },
      data: { userId: senco.userId },
    });
    expect(
      grant.ok(),
      `Granting Learning Support to the E2E SENCo answered ${grant.status()}: ${(await grant.text()).slice(0, 300)}`,
    ).toBeTruthy();

    const note =
      "The E2E SENCo account held no Learning Support, so the suite granted it as the E2E admin. Check which account E2E_SENCO_EMAIL names: one that never had a grant reads the same as one whose grant was revoked (revoked_by_user_id tells them apart).";
    console.warn(`::warning title=Learning Support granted::${note}`);
    const summary = process.env.GITHUB_STEP_SUMMARY;
    if (summary) appendFileSync(summary, `\n> **Learning Support granted.** ${note}\n`);
  } finally {
    await request.dispose();
  }
});

async function signInAsSenco(page: Page, request: APIRequestContext) {
  const body = await signIn(request, EMAIL as string, PASSWORD as string, "SENCo");
  // The same two admin roles the admin suite accepts. Learning Support is
  // checked separately below, because no role carries it.
  expect(
    ["senco_admin", "other_admin"],
    `The E2E SENCo account must be an admin (got "${body.role}")`,
  ).toContain(body.role);
  expect(
    body.accessToken,
    "The login response carried no accessToken - has SessionResponse changed again?",
  ).toBeTruthy();

  sencoToken = body.accessToken;
  const session = {
    token: body.accessToken,
    expiresAt: body.expiresAt,
    userId: body.userId,
    role: body.role,
  };

  await page.context().addCookies([
    {
      name: ROLE_COOKIE,
      value: body.role,
      url: page.url().startsWith("http") ? page.url() : "http://localhost:3100",
    },
  ]);
  // Before the first paint, as in the admin suite: otherwise the console
  // mounts signed out and renders the fixtures this suite checks for.
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [SESSION_KEY, JSON.stringify(session)] as const,
  );
}

test.beforeEach(async ({ page, request }) => {
  await signInAsSenco(page, request);
});

/**
 * The screens decide "you don't have it" from this read (`viewerHoldsIt`), so
 * every "no refusal" check below waits for it first. Asserting the absence of
 * a refusal before the page has asked would pass on any account.
 */
const holdersRead = (page: Page) =>
  page.waitForResponse((r) => r.url().includes("/learning-support/holders"), LIVE);

/** Every sample marker on the page - none is allowed on a signed-in admin page. */
async function sampleKinds(page: Page) {
  return page
    .locator(`[${SAMPLE_ATTR}]`)
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-nevo-sample")));
}

test("the account holds Learning Support, so this suite is testing a holder", async ({
  request,
}) => {
  const res = await request.get(`${API}/api/v1/learning-support/holders`, {
    headers: { Authorization: `Bearer ${sencoToken}` },
  });
  expect(
    res.ok(),
    `GET /api/v1/learning-support/holders answered ${res.status()}`,
  ).toBeTruthy();
  const body = (await res.json()) as { viewerHoldsIt: boolean };
  expect(
    body.viewerHoldsIt,
    "The E2E SENCo account still lacks Learning Support after the suite's own setup, so every check below would be testing the refusal the admin suite already covers.",
  ).toBe(true);
});

test("Learning Support opens for its holder, with no refusal and no sample", async ({
  page,
}) => {
  const asked = holdersRead(page);
  await page.goto("/admin/senco");
  expect((await asked).status(), "the holders read the page made").toBe(200);

  await expect(
    page.getByRole("heading", { level: 2, name: "Learning Support" }),
  ).toBeVisible(LIVE);
  await expect(page.getByText(/couldn.t load Learning Support/i)).toHaveCount(0);
  // The line only an administrator WITHOUT Learning Support reads (SencoView).
  await expect(page.locator("#ack-needs-learning-support")).toHaveCount(0);
  expect(await sampleKinds(page), "/admin/senco rendered a fixture region").toEqual([]);
});

test("a learner's adaptation history reads for the holder", async ({
  page,
  request,
}) => {
  /*
   * The admin suite's test of this page accepts either a reading or NO ACCESS,
   * because its account is refused (403 `learning_support_role_required`).
   * This account is not, so only a reading passes: the API answers 200, and
   * the page says neither "no access" nor "couldn't read".
   */
  const auth = { Authorization: `Bearer ${sencoToken}` };
  const roster = await request.get(`${API}/api/v1/students`, { headers: auth });
  expect(roster.ok(), `GET /api/v1/students answered ${roster.status()}`).toBeTruthy();
  const students = (await roster.json()) as { id: string }[];
  test.skip(students.length === 0, "The E2E tenant has no students to open.");
  const id = students[0].id;

  const history = await request.get(`${API}/api/adaptations/student/${id}?limit=8`, {
    headers: auth,
  });
  expect(
    history.status(),
    `GET /api/adaptations/student/${id} answered ${history.status()}: ${(await history.text()).slice(0, 300)}`,
  ).toBe(200);

  const read = page.waitForResponse(
    (r) => r.url().includes(`/adaptations/student/${id}`),
    LIVE,
  );
  await page.goto(`/admin/senco/${id}`);
  expect((await read).status(), "the history read the page made").toBe(200);

  await expect(page.getByText(/Recent adaptations/i).first()).toBeVisible(LIVE);
  await expect(page.getByText(/don.t have access to .* adaptation history/i)).toHaveCount(0);
  await expect(page.getByText(/couldn.t read .* adaptation history/i)).toHaveCount(0);
  expect(await sampleKinds(page), `/admin/senco/${id} rendered a fixture region`).toEqual(
    [],
  );
});

test("the IEP exporter opens for its holder", async ({ page }) => {
  // SCRUM-247: without Learning Support the exporter is unavailable, not
  // missing. With it, the refusal page must never be what loads.
  const asked = holdersRead(page);
  await page.goto("/admin/senco/export");
  expect((await asked).status(), "the holders read the page made").toBe(200);

  await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible(LIVE);
  await expect(page.getByText(/don.t have access to the IEP exporter/i)).toHaveCount(0);
});
