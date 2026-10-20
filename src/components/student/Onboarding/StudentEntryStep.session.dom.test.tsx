import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { StudentEntryStep } from "./StudentEntryStep";
import { AuthProvider } from "@/context/AuthContext";
import {
  getOnboardingDraft,
  markRunFinished,
  startOnboardingDraft,
} from "@/lib/auth/onboarding";
import { clearSession, getSession, setSession } from "@/lib/auth/session";
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
 *  - LEAVING BY BACK with another child's session held ends it, then goes to
 *    the Welcome; a session stored on 05 itself is kept.
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

describe("05 for the child this tab finished its run as", () => {
  it("routes them on, signed in, and ends nothing", async () => {
    markRunFinished("amara");
    open05();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(getSession()?.userId).toBe("amara");
    expect(replace).toHaveBeenCalledWith("/student/onboarding/continue");
  });

  it("keeps their session through the device's own Back", async () => {
    markRunFinished("amara");
    open05();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(getSession()?.userId).toBe("amara");
    expect(replace).not.toHaveBeenCalledWith("/student/onboarding");
  });
});

/*
 * LEAVING 05 BY BACK WITH ANOTHER CHILD'S SESSION HELD (19 Oct browser-storage
 * audit). Back went to the Welcome with Amara's session still stored, and the
 * route guard sends anyone carrying the student cookie from the Welcome on to
 * Home - so the next child landed on Amara's Home, signed in as her. Leaving
 * ends the session 05 has been holding, through the path every sign-out
 * takes, and then goes to the Welcome.
 */
describe("leaving 05 by Back with another child's session held", () => {
  /** Where the session stood at the moment each navigation was asked for. */
  let atNavigation: (string | null)[] = [];
  beforeEach(() => {
    atNavigation = [];
    const note = () => {
      atNavigation.push(getSession()?.userId ?? null);
    };
    push.mockImplementation(note);
    replace.mockImplementation(note);
  });

  it("ends it from the Back chevron, as at Sign out, then goes to the Welcome", async () => {
    open05();
    expect(getSession()?.userId).toBe("amara");

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(getSession()).toBeNull();
    expect(push).toHaveBeenCalledWith("/student/onboarding");
    // Ended before the Welcome was asked for, not after.
    expect(atNavigation).toEqual([null]);
    // Her own unsent signals got their last try with her token, as at any
    // sign-out - and that is all that went as her.
    const asAmara = sent.filter((r) => r.auth === "Bearer tok-amara");
    expect(asAmara).toHaveLength(1);
    expect(asAmara[0].body).toContain(AMARAS_STREAM.sessionId);
  });

  it("ends it on the device's own Back too, and lands on the Welcome", async () => {
    open05();
    expect(getSession()?.userId).toBe("amara");

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(getSession()).toBeNull();
    expect(replace).toHaveBeenCalledWith("/student/onboarding");
    expect(atNavigation).toEqual([null]);
    const asAmara = sent.filter((r) => r.auth === "Bearer tok-amara");
    expect(asAmara).toHaveLength(1);
  });

  it("ends it from the age check's hold on 05, whose Back is the same chevron", async () => {
    // A held child ends nothing on the match, so the session is still held
    // when they leave.
    lookupBody = { ...MATCHED, ageCheckPending: true };
    open05();
    await typeThePair();
    expect(
      screen.getByText("Nevo is sorting something out with your school"),
    ).toBeInTheDocument();
    expect(getSession()?.userId).toBe("amara");

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(getSession()).toBeNull();
    expect(push).toHaveBeenCalledWith("/student/onboarding");
    expect(atNavigation).toEqual([null]);
  });

  it("keeps a session a cleared child's new PIN stored on 05", async () => {
    lookupBody = { ...MATCHED, pinCleared: true };
    open05();
    await typeThePair();
    expect(
      screen.getByRole("heading", { name: "Choose a new PIN" }),
    ).toBeInTheDocument();
    for (const digit of ["1", "2", "3", "4", "1", "2", "3", "4"]) {
      fireEvent.click(screen.getByRole("button", { name: digit }));
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(getSession()?.userId).toBe("tobi");

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(getSession()).toMatchObject({ userId: "tobi", token: "tok-tobi" });
    expect(replace).not.toHaveBeenCalledWith("/student/onboarding");
  });
});
