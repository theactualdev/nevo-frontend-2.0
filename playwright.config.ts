import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests.
 *
 * SIGNED-OUT AND READ-ONLY - but no longer because it has to be.
 *
 * The blocker is gone. `POST /api/v1/schools/register` was returning 500 on
 * valid input; backend fixed it, and a dedicated E2E tenant now exists - an
 * empty, isolated school whose every collection reads `[]`, so write-path
 * tests cannot touch a real child. The sample marks that make a signed-in
 * assertion honest are already in place; see `lib/sampleData.ts`.
 *
 * What remains before a signed-in spec is mechanics, not permission: the token
 * lives in localStorage, invisible to the server, so `storageState` will not
 * carry a session on its own. Sign in through the API and seed localStorage
 * before first paint. Credentials belong in CI secrets, never in this repo.
 * See `docs/BUILD_STATUS.md` for the tenant's details.
 *
 * What this file covers today is what can be checked truthfully without an
 * account: that the route guards send people to the right door, and that the
 * public pages render. Both are real properties - the guard one is
 * security-relevant - and neither can be faked by the fixture fallback.
 *
 * `webServer` builds and starts the app itself, so `npm run e2e` needs nothing
 * running first and CI needs no separate step.
 */
export default defineConfig({
  testDir: "./e2e",
  // The app is the shared resource here, not the CPU: these are read-only
  // navigations, so they parallelise safely.
  fullyParallel: true,
  /*
   * ONE WORKER WHENEVER AN ACCOUNT IS IN PLAY.
   *
   * Signed out, the specs are read-only navigations and parallel is safe. The
   * signed-in suites are not, and `mode: "serial"` inside a file cannot help
   * across files: the admin suite and the student suite both sign in as the
   * SAME admin (the student suite does it to clear the probe's PIN), and every
   * sign-in replaces that account's previous session. Two workers let one
   * file's login kill the other's session mid-walk, and the console bounces to
   * "you signed in on another device" - which reads exactly like a product bug.
   *
   * `undefined` restores Playwright's default for a signed-out run.
   */
  workers:
    process.env.E2E_ADMIN_EMAIL || process.env.E2E_TEACHER_EMAIL ? 1 : undefined,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 30_000,

  use: {
    //  not : an empty E2E_BASE_URL should fall back, not become the
    // base URL.  only catches null/undefined and silently produced "".
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3100",
    // Kept only for a failure, so a green run costs nothing on disk.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],

  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // Production build, not `next dev`: dev-mode overlays and slower
        // compiles make timing-sensitive assertions flaky, and the thing
        // being shipped is the build.
        command: "npm run build && npx next start -p 3100",
        url: "http://localhost:3100",
        timeout: 300_000,
        reuseExistingServer: !process.env.CI,
      },
});
