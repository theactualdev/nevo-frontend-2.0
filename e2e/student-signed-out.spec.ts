import { expect, test, type Page } from "@playwright/test";

/**
 * The student console's doors, SIGNED OUT.
 *
 * Every screen a child can stand on before they have a session: the Welcome,
 * the onboarding steps reached by address, the two links that bring a child in,
 * Forgot PIN, and the screens a session ends on. These run on every CI run,
 * secrets or none, because none of them needs an account.
 *
 * WHAT IS ASSERTED. That each renders its own screen - its heading, its logo
 * where it carries one, and a way on or a way out - with every image it asks
 * for actually loaded, and no `data-nevo-sample` mark anywhere: none of these
 * screens has a fixture fallback, so a mark here is a fixture leaking onto a
 * door. Images are checked because a missing asset is invisible to every unit
 * test - jsdom never loads one - and these are the screens a child sees first
 * and when something has gone wrong.
 *
 * NOTHING HERE WRITES. No field is typed into and nothing is submitted. Two
 * tests reach the backend - the entry link and the join link, each with a
 * token that resolves to nothing - and both are public reads that create
 * nothing. They are the only tests in this file that need the network.
 *
 * NOT HERE: `/student/onboarding/sequence`, the observed-interaction run. It is
 * the motor baseline itself; it starts a timed capture on arrival and moves on
 * by itself, and reaching it by address skips the steps that make it a run.
 * `/student/waiting` is guarded, so a signed-out visitor never sees it; the
 * signed-in suite renders it.
 */

const SAMPLE_ATTR = "data-nevo-sample";

/** A token in the shape of one, that no link was ever issued with. */
const OLD_TOKEN = "e2e-no-such-link-0000000000000000";

async function noSampleMarks(page: Page, where: string) {
  await expect(
    page.locator(`[${SAMPLE_ATTR}]`),
    `${where} rendered sample data, and no door has a fixture to show`,
  ).toHaveCount(0);
}

/**
 * Every image that has finished and has nothing to show, plus any still
 * loading. Polled, so a slow image is waited for and a broken one fails with
 * its address. A lazy image counts only once it is laid out on screen: below
 * the fold it loads when scrolled to, and nothing here scrolls.
 */
async function brokenImages(page: Page): Promise<string[]> {
  return page.locator("img").evaluateAll((imgs) =>
    (imgs as HTMLImageElement[])
      .filter((img) => {
        if (img.loading !== "lazy") return true;
        const box = img.getBoundingClientRect();
        return (
          box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < window.innerHeight
        );
      })
      .filter((img) => !img.complete || img.naturalWidth === 0)
      .map((img) => img.getAttribute("src") ?? "(no src)"),
  );
}

async function imagesLoad(page: Page, where: string) {
  await expect
    .poll(() => brokenImages(page), {
      message: `${where} has images that never loaded`,
      timeout: 15_000,
    })
    .toEqual([]);
}

test.describe("the student doors, signed out", () => {
  test("the Welcome renders the lockup and both ways in", async ({ page }) => {
    await page.goto("/student/onboarding");

    await expect(page.getByText("Let's get you learning")).toBeVisible();
    await expect(page.getByRole("img", { name: "Nevo" })).toBeVisible();
    await expect(page.getByRole("button", { name: "I have a school code" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "I'm joining through my teacher" }),
    ).toBeVisible();

    await imagesLoad(page, "The Welcome");
    await noSampleMarks(page, "The Welcome");
  });

  /*
   * The entry screen by each of its addresses, as a child arrives at one after
   * a reload or a back button: with nothing in this tab's draft. Since
   * SCRUM-208 (30 Sep) both doors on the Welcome reach the same screen, framed
   * for a code from the school or one read out by a teacher; the name, class,
   * class-code and QR steps are gone.
   */
  const STEPS: { path: string; heading: string; never?: string }[] = [
    { path: "/student/onboarding/school", heading: "Find your school" },
    { path: "/student/onboarding/teacher-join", heading: "Join your school" },
  ];

  for (const step of STEPS) {
    test(`${step.path} renders its own step`, async ({ page }) => {
      await page.goto(step.path);

      await expect(page.getByRole("heading", { name: step.heading })).toBeVisible();
      if (step.never) {
        await expect(page.getByRole("heading", { name: step.never })).toHaveCount(0);
      }

      await imagesLoad(page, step.path);
      await noSampleMarks(page, step.path);
    });
  }

  /*
   * A join link still in someone's messages (`/student/onboarding?token=`).
   * Children are no longer sent links (D5, SCRUM-208) and the Welcome no longer
   * reads the token, so an old one must land on the Welcome with both ways in,
   * never on a dead end. The entry link's route is gone with it.
   */
  test("an old join link opens the Welcome", async ({ page }) => {
    await page.goto(`/student/onboarding?token=${OLD_TOKEN}`);

    await expect(page.getByRole("button", { name: "I have a school code" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "I'm joining through my teacher" }),
    ).toBeVisible();
    await noSampleMarks(page, "The Welcome from an old link");
  });

  test("Forgot PIN explains, and offers the way back to sign in", async ({ page }) => {
    await page.goto("/auth/forgot-pin");

    await expect(page.getByRole("heading", { name: "Forgot your PIN?" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to sign in" })).toHaveAttribute(
      "href",
      /^\/auth\/login/,
    );

    await imagesLoad(page, "Forgot PIN");
    await noSampleMarks(page, "Forgot PIN");
  });

  /*
   * Where a session ends: replaced by a sign-in elsewhere, expired, revoked,
   * or the account paused. Each is the last screen a child sees before they
   * are out, so each must carry the logo - the one thing on it that says this
   * is still Nevo - and a way back to the door that actually goes there.
   */
  const ENDINGS: { path: string; heading: string | RegExp; wayOut: string }[] = [
    {
      path: "/auth/session-ended",
      // Board 28, 6 Oct: the same heading as revoked, with its own body.
      heading: "Your session has ended.",
      wayOut: "Log back in",
    },
    {
      path: "/auth/session-expired",
      heading: "You've been away for a while",
      wayOut: "Log back in",
    },
    {
      path: "/auth/session-expired?reason=session_revoked",
      heading: "Your session has ended.",
      wayOut: "Sign in",
    },
    {
      path: "/auth/session-expired?reason=account_paused",
      // The phone heading breaks after "account"; the words are the same.
      heading: /Your Nevo account\s*is on pause\./,
      wayOut: "Back to sign in",
    },
  ];

  for (const ending of ENDINGS) {
    test(`${ending.path} carries the logo and a way out`, async ({ page }) => {
      await page.goto(ending.path);

      await expect(page.getByRole("heading", { name: ending.heading })).toBeVisible();
      await expect(page.getByRole("img", { name: "Nevo" })).toBeVisible();
      await imagesLoad(page, ending.path);
      await noSampleMarks(page, ending.path);

      await page.getByRole("link", { name: ending.wayOut, exact: true }).click();
      await expect(page).toHaveURL(/\/auth\/login/);
    });
  }
});
