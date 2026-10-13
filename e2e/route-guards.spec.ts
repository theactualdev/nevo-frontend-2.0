import { expect, test } from "@playwright/test";

/**
 * Where a signed-out visitor ends up.
 *
 * This is the one property worth testing end-to-end before there is an
 * account to sign in with, because it is the only one a browser can check and
 * a unit test cannot: the guard lives in `proxy.ts`, which runs on the server
 * between the request and the page, so nothing below the browser ever sees it.
 *
 * It is also security-adjacent. The guard is OPTIMISTIC by design - it reads a
 * client-written role cookie, never the Bearer token, and the real
 * authorisation boundary is the API. What it buys is that a signed-out visitor
 * never receives console markup at all: no flash of a roster that is not
 * theirs. That is the property under test here.
 *
 * The `?next=` round trip matters more than it looks. Without it, a teacher
 * who followed a link to a class lands on a sign-in form and, after signing
 * in, arrives somewhere else entirely - which reads as the link being broken.
 */

const GUARDED = [
  { path: "/teacher/dashboard", door: "/auth/teacher" },
  { path: "/teacher/classes", door: "/auth/teacher" },
  { path: "/teacher/insights", door: "/auth/teacher" },
  { path: "/admin/dashboard", door: "/auth/admin" },
  { path: "/admin/students", door: "/auth/admin" },
];

test.describe("a signed-out visitor", () => {
  for (const { path, door } of GUARDED) {
    test(`is sent from ${path} to ${door}`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`^.*${door}`));
    });

    test(`keeps ${path} as the destination to return to`, async ({ page }) => {
      await page.goto(path);
      // The door has to know where they were headed, or signing in drops
      // them somewhere they did not ask for.
      expect(new URL(page.url()).searchParams.get("next")).toBe(path);
    });
  }

  test("is sent to the TEACHER door for a teacher route, not the admin one", async ({
    page,
  }) => {
    // The two doors are different screens with different copy. Sending a
    // teacher to the admin sign-in reads as "you are not allowed here" rather
    // than "please sign in".
    await page.goto("/teacher/classes");
    await expect(page).toHaveURL(/\/auth\/teacher/);
    await expect(page).not.toHaveURL(/\/auth\/admin/);
  });

  test("receives no console markup on the way", async ({ page }) => {
    // The whole point of an optimistic guard: not authorisation, but never
    // shipping a roster to someone who is not signed in - not even for the
    // instant before a client-side redirect.
    const response = await page.goto("/teacher/classes");
    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("body")).not.toContainText("Worth your attention");
  });
});

test.describe("routes that must stay open", () => {
  test("student onboarding is reachable without a session", async ({ page }) => {
    // A child onboarding has no session yet by definition. Guarding this
    // would make the product unusable for every new student.
    await page.goto("/student/onboarding");
    await expect(page).toHaveURL(/\/student\/onboarding/);
  });

  test("the teacher sign-in door is not itself guarded", async ({ page }) => {
    // Guarding the door would be a redirect loop.
    await page.goto("/auth/teacher");
    await expect(page).toHaveURL(/\/auth\/teacher/);
  });
});

/**
 * T232. The teacher's own doors before a session exists - activating an
 * account, resetting a password, coming back from school SSO, and landing
 * after a session ran out - were never opened by any spec.
 */
test.describe("the teacher's doors before a session", () => {
  test("activation opens the password form", async ({ page }) => {
    await page.goto("/auth/teacher/activate");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Create your password");
  });

  test("the reset opens the request form", async ({ page }) => {
    await page.goto("/auth/teacher/reset");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Reset your password");
  });

  test("the SSO callback with no handshake says it could not sign them in", async ({ page }) => {
    // No code on the URL is no handshake. It used to write a token-less
    // session that the route guard let into the console.
    await page.goto("/auth/teacher/sso-callback");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("We couldn't sign you in");
    await expect(page).toHaveURL(/\/auth\/teacher\/sso-callback/);
  });

  test("the expired screen hands Sign in the place they were", async ({ page }) => {
    await page.goto(
      `/auth/teacher/session-expired?next=${encodeURIComponent("/teacher/classes/c-1")}`,
    );
    const link = page.getByRole("link", { name: "Sign in" });

    await expect(link).toHaveAttribute(
      "href",
      `/auth/teacher?next=${encodeURIComponent("/teacher/classes/c-1")}`,
    );
  });

  test("the guard remembers the query too, where a tab or a section lives", async ({ page }) => {
    await page.goto("/teacher/classes?tab=roster");

    expect(new URL(page.url()).searchParams.get("next")).toBe("/teacher/classes?tab=roster");
  });
});
