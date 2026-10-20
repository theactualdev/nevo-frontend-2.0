import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, useLayoutEffect, useState } from "react";
import { flushSync } from "react-dom";
import { StudentEntryStep } from "./StudentEntryStep";
import { WelcomeScreen } from "@/components/student/Welcome/WelcomeScreen";
import { AuthProvider } from "@/context/AuthContext";
import { isHeldAtDoor } from "@/lib/auth/doorSession";
import {
  getOnboardingDraft,
  markRunFinished,
  startOnboardingDraft,
} from "@/lib/auth/onboarding";
import { clearSession, getSession, setSession } from "@/lib/auth/session";
import { onSessionEnd } from "@/lib/auth/sessionEnd";
import { holdSignals } from "@/lib/signals/outbox";

/**
 * 05 ENTRY WITH A SESSION STILL STORED (19 Oct browser-storage audit).
 *
 * Everything on 05 sent the stored session: its lookup, its signal stream,
 * the app's routine reads. The rule now, the run's rather than the screen's:
 *
 *  - A DIFFERENT CHILD'S RUN IS IN PROGRESS - a draft 05 matched for someone
 *    who walked away - and Amara's session is still stored: her session ends
 *    through the path every sign-out takes (her own unsent signals get their
 *    one last try with her token), the walked-away draft goes, and the new
 *    child's requests carry no token at all.
 *  - NO RUN IS IN PROGRESS: the stored session is the child's own - back on
 *    05 from their first lesson - and they are routed on, signed in, to
 *    finish onboarding as themselves. Nothing is ended, and nothing on 05 is
 *    sent as them while it is open.
 *  - LEAVING 05 BY ANY WAY with another child's session held ends it - the
 *    chevron, and the device's own Back as Next's router delivers it; a
 *    session a PIN stored on 05 itself is kept, and routed on when Back
 *    comes to 05 again.
 *
 * The real network layer runs here; only `fetch` is replaced, to read what
 * each request carried.
 */

vi.setConfig({ testTimeout: 30_000 });

const { push, replace } = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, back: vi.fn() }),
}));

interface Sent {
  url: string;
  auth: string | null;
  body: string;
}
let sent: Sent[] = [];

const MATCHED = {
  firstName: "Tobi",
  className: "JSS 1B",
  consentState: "given",
  age: 11,
  ageBand: "junior_secondary",
  yearGroup: "JSS 1",
  accountReady: false,
  ageCheckPending: false,
};

/** What the lookup answers, per test: Tobi, matched for a first run. */
let lookupBody: Record<string, unknown> = MATCHED;

/** `POST /student-entry/pin`'s answer: Tobi's new PIN, and his session. */
const TOBIS_NEW_PIN = {
  userId: "tobi",
  loginIdentifier: "NV-TOBI1",
  session: {
    accessToken: "tok-tobi",
    tokenType: "bearer",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId: "tobi",
    role: "student",
  },
};

const AMARAS_STREAM = {
  sessionId: "fd0cba6c-0828-48e3-8510-c78146a5d449",
  lessonId: "9c1e77aa-1111-4222-8333-444455556666",
  sessionType: "lesson" as const,
  startedAt: "2026-10-19T09:00:00.000Z",
};

beforeEach(async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  sent = [];
  lookupBody = MATCHED;
  push.mockReset();
  replace.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = (init?.headers ?? {}) as Record<string, string>;
      sent.push({
        url,
        auth: headers.Authorization ?? null,
        body: typeof init?.body === "string" ? init.body : "",
      });
      const body = url.includes("/student-entry/lookup")
        ? lookupBody
        : url.includes("/student-entry/pin")
          ? TOBIS_NEW_PIN
          : {};
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  // Amara signed in on this tablet and never signed out, with a break
  // feeling of hers still waiting to go.
  setSession({
    token: "tok-amara",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId: "amara",
    role: "student",
  });
  // Her session's own sign-in moment has passed: nothing is on its way.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  holdSignals("amara", AMARAS_STREAM, [
    {
      type: "feeling_checkin",
      timestamp: "2026-10-19T09:00:01.000Z",
      payload: { feeling: "tired" },
    },
  ]);
  sent = [];
});

afterEach(async () => {
  clearSession();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const open05 = () =>
  render(
    <AuthProvider>
      <StudentEntryStep framing="school" />
    </AuthProvider>,
  );

async function typeThePair() {
  const cells = screen.getAllByLabelText(
    /School code, character/,
  ) as HTMLInputElement[];
  fireEvent.change(cells[0], { target: { value: "k7dq" } });
  fireEvent.change(screen.getByLabelText("Student ID / Admission Number"), {
    target: { value: "bga/2031" },
  });
  fireEvent.click(screen.getByRole("button", { name: /^Continue$/ }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(7_000);
  });
}

describe("05 with another child's session stored, and a walked-away run in the tab", () => {
  beforeEach(() => {
    startOnboardingDraft({
      schoolCode: "K7DQ",
      admissionNumber: "OLD/1",
      name: "Femi",
      consent: "given",
    });
  });

  it("ends that session, takes the walked-away draft, and sends Tobi's lookup as nobody", async () => {
    open05();
    expect(getSession()).toBeNull();
    expect(getOnboardingDraft()).toEqual({});

    await typeThePair();

    const lookup = sent.filter((r) => r.url.includes("/student-entry/lookup"));
    expect(lookup).toHaveLength(1);
    expect(lookup[0].auth).toBeNull();
    expect(
      sent.some((r) => /consent-gate|users\/me|auth\/session/.test(r.url)),
    ).toBe(false);
    // The one request carrying her token is her own break feeling's last try.
    const asAmara = sent.filter((r) => r.auth === "Bearer tok-amara");
    expect(asAmara).toHaveLength(1);
    expect(asAmara[0].body).toContain(AMARAS_STREAM.sessionId);
    // Tobi's own run, with 05's own draft.
    expect(push).toHaveBeenCalledWith("/student/onboarding/sequence");
    expect(getOnboardingDraft()).toMatchObject({
      name: "Tobi",
      admissionNumber: "BGA/2031",
    });
  });
});

/*
 * A NEW CHILD OPENING 05 OVER ANOTHER CHILD'S STORED SESSION (19 Oct). With
 * no run in progress, 05 routed the stored session on - so a new child
 * landed in the last child's onboarding-continue, and from there their Home.
 * Nothing in the tab says whose that session is, so 05 neither routes into
 * it nor ends it on sight: it is a door over it, and the child's own lookup
 * decides. That lookup carries no account id to compare, so a child who goes
 * on from it ends the stored session first - the safe side.
 */
describe("05 over another child's stored session, with no run in progress", () => {
  it("never routes the new child into that session", async () => {
    open05();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(replace).not.toHaveBeenCalledWith("/student/onboarding/continue");
    expect(push).not.toHaveBeenCalledWith("/student/dashboard");
    // Kept, until a lookup says a child is going on.
    expect(getSession()?.userId).toBe("amara");
  });

  it("sends nothing as that session while 05 is open: no routine read, no stream", async () => {
    open05();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7_000);
    });

    expect(sent.filter((r) => r.auth === "Bearer tok-amara")).toEqual([]);
    expect(sent.filter((r) => r.url.includes("/api/signals"))).toEqual([]);
  });

  it("ends it only once the lookup has a child to go on with, then carries on with theirs", async () => {
    open05();
    expect(getSession()?.userId).toBe("amara");

    await typeThePair();

    expect(getSession()).toBeNull();
    expect(replace).not.toHaveBeenCalledWith("/student/onboarding/continue");
    expect(push).toHaveBeenCalledWith("/student/onboarding/sequence");
    expect(getOnboardingDraft()).toMatchObject({ name: "Tobi" });
    // Her own unsent signals got their last try, as at any sign-out.
    const asAmara = sent.filter((r) => r.auth === "Bearer tok-amara");
    expect(asAmara).toHaveLength(1);
    expect(asAmara[0].body).toContain(AMARAS_STREAM.sessionId);
  });
});


/*
 * THE TABLET'S HISTORY, AND NEXT'S ROUTER OVER IT (19 Oct, on-screen QA).
 * Next added its own `popstate` listener when the app first loaded - before
 * 05 existed to add one - and it draws the page the history goes back to
 * inside that same dispatch. So 05 is unmounted, and any listener of its own
 * removed, before that listener is called. Firing `popstate` at a lone 05
 * never showed this: its listener was the only one, and ran.
 */
type Page = "welcome" | "05" | "03" | "elsewhere";
const PAGES: Record<string, Page> = {
  "/student/onboarding": "welcome",
  "/student/onboarding/school": "05",
  "/student/onboarding/teacher-join": "03",
};
/** The history, oldest first; the last is the page on screen. */
let history: Page[] = [];
let show: (page: Page) => void = () => {};
/** Where the session stood at the moment each navigation was asked for. */
let atNavigation: (string | null)[] = [];

function Tablet() {
  const [page, setPage] = useState<Page>(() => history[history.length - 1]);
  useLayoutEffect(() => {
    show = setPage;
  }, []);
  if (page === "welcome") return <WelcomeScreen />;
  if (page === "05") return <StudentEntryStep key="05" framing="school" />;
  if (page === "03") return <StudentEntryStep key="03" framing="teacher" />;
  return <p>Somewhere else</p>;
}

/** Next's own Back: the page before, drawn inside the dispatch. */
function nextsOwnBack() {
  history.pop();
  const page = history[history.length - 1];
  flushSync(() => show(page));
}

function navigate(how: "push" | "replace") {
  return (url: string) => {
    atNavigation.push(getSession()?.userId ?? null);
    const page = PAGES[url] ?? "elsewhere";
    if (how === "push") history.push(page);
    else history[history.length - 1] = page;
    show(page);
  };
}

/**
 * The tablet on `pages`, settled as a child would find it: what the page
 * asked for on opening has been asked before anyone can press anything.
 */
async function onTablet(pages: Page[], { strict = false } = {}) {
  history = pages;
  const tablet = (
    <AuthProvider>
      <Tablet />
    </AuthProvider>
  );
  render(strict ? <StrictMode>{tablet}</StrictMode> : tablet);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

/** Next's listener is there before 05 is: added before anything renders. */
function nextsRouter() {
  history = [];
  atNavigation = [];
  show = () => {};
  window.addEventListener("popstate", nextsOwnBack);
  return () => window.removeEventListener("popstate", nextsOwnBack);
}

async function devicesBack() {
  act(() => {
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

const DRAFT_KEY = "nevo.onboarding.draft";
const roleCookie = () => /(?:^|;\s*)nevo\.role=student/.test(document.cookie);

describe("leaving 05 with another child's session held", () => {
  let offRouter = () => {};
  beforeEach(() => {
    offRouter = nextsRouter();
    push.mockImplementation(navigate("push"));
    replace.mockImplementation(navigate("replace"));
  });
  afterEach(() => offRouter());

  it("ends it on the device's own Back, landing on the Welcome with no session, no cookie and no empty draft", async () => {
    await onTablet(["welcome", "05"]);
    expect(getSession()?.userId).toBe("amara");

    await devicesBack();

    expect(
      screen.getByRole("button", { name: "I have a school code" }),
    ).toBeInTheDocument();
    expect(getSession()).toBeNull();
    expect(window.localStorage.getItem("nevo.auth.session")).toBeNull();
    expect(roleCookie()).toBe(false);
    // The Welcome starts the next child's draft with nothing in it, and so
    // stores nothing.
    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBeNull();
    // Her own unsent signals got their last try with her token, as at any
    // sign-out - and that is all that went as her.
    const asAmara = sent.filter((r) => r.auth === "Bearer tok-amara");
    expect(asAmara).toHaveLength(1);
    expect(asAmara[0].body).toContain(AMARAS_STREAM.sessionId);
  });

  it("ends it on the device's own Back to 03, which opens over nothing, and 03's own Back ends nothing more", async () => {
    await onTablet(["welcome", "03", "05"]);
    expect(getSession()?.userId).toBe("amara");

    await devicesBack();

    expect(
      screen.getByRole("heading", { name: "Join your school" }),
    ).toBeInTheDocument();
    expect(getSession()).toBeNull();
    expect(roleCookie()).toBe(false);

    await devicesBack();

    expect(
      screen.getByRole("button", { name: "I have a school code" }),
    ).toBeInTheDocument();
    expect(getSession()).toBeNull();
    expect(sent.filter((r) => r.auth === "Bearer tok-amara")).toHaveLength(1);
  });

  it("ends it from the Back chevron, as at Sign out, before the Welcome is asked for", async () => {
    await onTablet(["welcome", "05"]);

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(push).toHaveBeenCalledWith("/student/onboarding");
    expect(atNavigation).toEqual([null]);
    expect(getSession()).toBeNull();
    expect(window.sessionStorage.getItem(DRAFT_KEY)).toBeNull();
    const asAmara = sent.filter((r) => r.auth === "Bearer tok-amara");
    expect(asAmara).toHaveLength(1);
    expect(asAmara[0].body).toContain(AMARAS_STREAM.sessionId);
  });

  it("ends it from the age check's hold on 05, by its chevron", async () => {
    // A held child ends nothing on the match, so the session is still held
    // when they leave.
    lookupBody = { ...MATCHED, ageCheckPending: true };
    await onTablet(["welcome", "05"]);
    await typeThePair();
    expect(
      screen.getByText("Nevo is sorting something out with your school"),
    ).toBeInTheDocument();
    expect(getSession()?.userId).toBe("amara");

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(push).toHaveBeenCalledWith("/student/onboarding");
    expect(atNavigation).toEqual([null]);
    expect(getSession()).toBeNull();
  });

  it("ends it from the age check's hold on 05 by the device's Back too", async () => {
    lookupBody = { ...MATCHED, ageCheckPending: true };
    await onTablet(["welcome", "05"]);
    await typeThePair();
    expect(getSession()?.userId).toBe("amara");

    await devicesBack();

    expect(getSession()).toBeNull();
    expect(roleCookie()).toBe(false);
  });

  it("holds it through Strict Mode's rehearsed unmount, and ends it only when 05 is left", async () => {
    await onTablet(["welcome", "05"], { strict: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    // Development mounts every screen twice; that is not a child leaving.
    expect(getSession()?.userId).toBe("amara");
    expect(isHeldAtDoor("tok-amara")).toBe(true);
    expect(sent.filter((r) => r.auth === "Bearer tok-amara")).toEqual([]);

    await devicesBack();

    expect(getSession()).toBeNull();
  });

  it("leaves a way on after the lookup as it was: Tobi goes to his first run with his own draft", async () => {
    await onTablet(["welcome", "05"]);

    await typeThePair();

    expect(push).toHaveBeenCalledWith("/student/onboarding/sequence");
    expect(screen.getByText("Somewhere else")).toBeInTheDocument();
    // Ended at the match, before the way on was asked for - and once.
    expect(atNavigation).toEqual([null]);
    expect(getSession()).toBeNull();
    expect(sent.filter((r) => r.auth === "Bearer tok-amara")).toHaveLength(1);
    expect(getOnboardingDraft()).toMatchObject({
      name: "Tobi",
      schoolCode: "K7DQ",
      admissionNumber: "BGA/2031",
    });
  });
});

/*
 * A SESSION MADE ON 05 IS THIS TAB'S OWN (19 Oct, on-screen QA). Chidi's
 * teacher cleared his PIN; he chose a new one on 05 and went Home. The
 * device's Back came to 05 again, which held his new session as one it had
 * found stored - so leaving it, by its chevron or any other way, ended his
 * own session: his last try went as him, his cookie went, and his queued
 * signals were dropped. Marked as the tab's own when the PIN stored it, he
 * is routed on, signed in, and nothing on 05 ends it.
 */
describe("a cleared child's new PIN on 05, then the device's Back to 05", () => {
  let offRouter = () => {};
  beforeEach(() => {
    offRouter = nextsRouter();
    push.mockImplementation(navigate("push"));
    // 05 stays up while it routes him on, as over a slow route.
    replace.mockImplementation(() => {
      atNavigation.push(getSession()?.userId ?? null);
    });
  });
  afterEach(() => offRouter());

  it("routes him on, offers no Back that ends him, and keeps his session off 05 again", async () => {
    lookupBody = { ...MATCHED, pinCleared: true };
    await onTablet(["welcome", "05"]);
    await typeThePair();
    for (const digit of ["1", "2", "3", "4", "1", "2", "3", "4"]) {
      fireEvent.click(screen.getByRole("button", { name: digit }));
    }
    // Stored, the "all set" beat, then Home.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7_000);
    });
    expect(getSession()).toMatchObject({ userId: "tobi", token: "tok-tobi" });
    expect(push).toHaveBeenCalledWith("/student/dashboard");
    expect(screen.getByText("Somewhere else")).toBeInTheDocument();
    const ended: string[] = [];
    const off = onSessionEnd((e) => ended.push(e.userId));

    // Back from Home: 05 again.
    await devicesBack();

    expect(replace).toHaveBeenCalledWith("/student/onboarding/continue");
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(getSession()).toMatchObject({ userId: "tobi", token: "tok-tobi" });

    // And off 05 again, by the device's Back once more.
    await devicesBack();
    off();

    expect(getSession()).toMatchObject({ userId: "tobi", token: "tok-tobi" });
    expect(roleCookie()).toBe(true);
    expect(ended).toEqual([]);
  });
});

describe("05 for the child this tab finished its run as", () => {
  let offRouter = () => {};
  beforeEach(() => {
    offRouter = nextsRouter();
  });
  afterEach(() => offRouter());

  it("routes them on, signed in, and ends nothing", async () => {
    markRunFinished("amara");
    open05();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(getSession()?.userId).toBe("amara");
    expect(replace).toHaveBeenCalledWith("/student/onboarding/continue");
  });

  it("keeps their session as the device's Back takes them off 05", async () => {
    markRunFinished("amara");
    await onTablet(["welcome", "05"]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(replace).toHaveBeenCalledWith("/student/onboarding/continue");

    await devicesBack();

    expect(getSession()?.userId).toBe("amara");
    expect(roleCookie()).toBe(true);
  });
});
