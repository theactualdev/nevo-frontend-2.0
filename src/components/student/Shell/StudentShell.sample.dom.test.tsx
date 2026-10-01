import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StudentShell } from "./StudentShell";
import { AccessibilityProvider } from "@/context/AccessibilityContext";
import { clearSession, setSession } from "@/lib/auth/session";
import { SAMPLE_ATTR } from "@/lib/sampleData";

/**
 * The mark exists so an end-to-end test can catch the console degrading to
 * fixtures — the failure this architecture actually has.
 *
 * A flow test sails past it: when a live read fails, the fallback renders
 * exactly what "the child sees their lessons" asserts. So the suite goes green
 * while a real child is shown invented data. The mark is the only thing that
 * distinguishes the two, which makes an UNMARKED fallback worse than no test at
 * all — it converts a silent bug into a passing build.
 *
 * Both directions matter and both are pinned here. A mark that never appears
 * catches nothing; a mark that always appears makes the assertion meaningless.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/student/dashboard",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
const { useBehaviouralCapture } = vi.hoisted(() => ({
  useBehaviouralCapture: vi.fn(),
}));
vi.mock("@/hooks", () => ({ useBehaviouralCapture }));

const { useConsentGate } = vi.hoisted(() => ({ useConsentGate: vi.fn() }));
vi.mock("@/hooks/useConsentGate", () => ({ useConsentGate }));
vi.mock("@/hooks/useSessionRefresh", () => ({ useSessionRefresh: vi.fn() }));
vi.mock("@/hooks/useSessionLapse", () => ({ useSessionLapse: vi.fn() }));
vi.mock("@/lib/lessons/pendingProgress", () => ({
  flushPendingProgress: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./NotificationBell", () => ({ NotificationBell: () => null }));

const { useOnline } = vi.hoisted(() => ({ useOnline: vi.fn(() => true) }));
vi.mock("./TabOfflineBanner", () => ({
  useOnline,
  TabOfflineBanner: () => <p>offline banner</p>,
}));
vi.mock("@/components/student/AskNevo/AskNevo", () => ({
  AskNevo: () => null,
}));
vi.mock("./useDisplayName", () => ({
  useDisplayName: () => ({ name: "", initials: "" }),
}));

/** The shell reads the accessibility context for its Text Size zoom. */
const renderShell = () =>
  render(
    <AccessibilityProvider>
      <StudentShell>
        <p>content</p>
      </StudentShell>
    </AccessibilityProvider>,
  );

const marks = () =>
  Array.from(document.querySelectorAll(`[${SAMPLE_ATTR}]`)).map((el) =>
    el.getAttribute(SAMPLE_ATTR),
  );

const signIn = () =>
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: "student-1",
    role: "student",
  });

beforeEach(() => {
  useBehaviouralCapture.mockClear();
  useOnline.mockReturnValue(true);
  useConsentGate.mockReturnValue({ withdrawn: false, known: true });
  clearSession();
  window.localStorage.clear();
});

afterEach(() => {
  clearSession();
  window.localStorage.clear();
});

describe("StudentShell — the sample mark", () => {
  it("marks the chrome while it is showing the fixture's identity", async () => {
    // Signed out: the sidebar really is showing "Ada" and "Year 4". Saying so
    // is what lets the E2E tell this page from a signed-in one.
    renderShell();

    await screen.findByText("content");
    expect(marks()).toContain("student:identity");
  });

  it("does not mark the chrome for a signed-in child", async () => {
    // THE ASSERTION THE E2E RESTS ON. If this ever fails, the suite can no
    // longer tell a real child's console from the walkthrough.
    signIn();
    renderShell();

    await screen.findByText("content");
    expect(marks()).not.toContain("student:identity");
  });

  it("names the surface, so a failure says which screen fell back", async () => {
    renderShell();

    await screen.findByText("content");
    expect(marks().every((m) => Boolean(m && m.trim()))).toBe(true);
  });

  it("changes no layout — the wrapper takes part in none", async () => {
    // A marker that shifted the page is a marker people delete.
    renderShell();

    await screen.findByText("content");
    for (const el of document.querySelectorAll(`[${SAMPLE_ATTR}]`)) {
      expect((el as HTMLElement).style.display).toBe("contents");
    }
  });
});

/**
 * The gate is only worth anything if the shell acts on it. The hook's own tests
 * prove it reads the answer; these prove the capture stops.
 */
describe("StudentShell — behavioural capture and consent", () => {
  it("captures for a child whose guardian has consented", async () => {
    useConsentGate.mockReturnValue({ withdrawn: false, known: true });
    renderShell();

    await screen.findByText("content");
    expect(useBehaviouralCapture).toHaveBeenCalledWith(true);
  });

  it("stops capturing when consent has been withdrawn", async () => {
    // The compliance failure: every tap and keystroke kept being written for a
    // child whose guardian had said no.
    useConsentGate.mockReturnValue({ withdrawn: true, known: true });
    renderShell();

    await screen.findByText("content");
    expect(useBehaviouralCapture).toHaveBeenCalledWith(false);
  });

  it("keeps capturing while the answer is still unknown", async () => {
    // A read in flight is not a refusal. Stopping here would silently stop
    // measuring consented children on every slow network.
    useConsentGate.mockReturnValue({ withdrawn: false, known: false });
    renderShell();

    await screen.findByText("content");
    expect(useBehaviouralCapture).toHaveBeenCalledWith(true);
  });
});

/**
 * Going offline used to take the tab away.
 *
 * First `offlineTakeover ? <OfflineTakeover /> : children`, which threw the tab
 * away the instant `navigator.onLine` flipped - so a child part-way through
 * typing a message to their teacher lost every word of it on a 3G blip. Then
 * hidden behind the same takeover, which kept the words but not the child's
 * view of them, under a "Try again" that could not do anything. Board 28 draws
 * a banner across the top of the tab instead, and the tab stays where it was.
 */
describe("StudentShell — going offline", () => {
  it("shows the banner when the connection drops", async () => {
    useOnline.mockReturnValue(false);
    renderShell();

    expect(await screen.findByText("offline banner")).toBeVisible();
  });

  it("leaves the tab in front of the child, not behind a takeover", async () => {
    // THE BUG. A takeover - unmounted or merely hidden - put the tab out of
    // reach, including whatever the child was in the middle of writing.
    useOnline.mockReturnValue(false);
    renderShell();

    await screen.findByText("offline banner");
    expect(screen.getByText("content")).toBeVisible();
  });

  it("drops the banner, and nothing else changes, when the signal returns", async () => {
    useOnline.mockReturnValue(false);
    const { rerender } = renderShell();
    await screen.findByText("offline banner");

    useOnline.mockReturnValue(true);
    rerender(
      <AccessibilityProvider>
        <StudentShell>
          <p>content</p>
        </StudentShell>
      </AccessibilityProvider>,
    );

    expect(screen.getByText("content")).toBeVisible();
    expect(screen.queryByText("offline banner")).toBeNull();
  });
});
