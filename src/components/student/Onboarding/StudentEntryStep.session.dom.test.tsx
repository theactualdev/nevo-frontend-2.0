import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { StudentEntryStep } from "./StudentEntryStep";
import { AuthProvider } from "@/context/AuthContext";
import { getOnboardingDraft } from "@/lib/auth/onboarding";
import { clearSession, getSession, setSession } from "@/lib/auth/session";
import { holdSignals } from "@/lib/signals/outbox";

/**
 * A NEW CHILD ON 05 WHILE ANOTHER CHILD'S SESSION IS STILL STORED (19 Oct
 * browser-storage audit).
 *
 * The onboarding routes let a stored session through, and everything on them
 * sent it: 05's lookup, the onboarding signal stream, the consent read, the
 * account read. So Tobi's first minutes were recorded against Amara's
 * account, Amara's consent decided Tobi's capture, and when Amara's token
 * died its 401 sent Tobi - who had no session - to the session-ended door.
 *
 * 05 ends the stored session as it first renders, through the path every
 * sign-out takes: Amara's own unsent signals get their one last try with her
 * token, and nothing of Tobi's ever carries it. The real network layer runs
 * here; only `fetch` is replaced, to read what each request carried.
 */

vi.setConfig({ testTimeout: 30_000 });

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
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

const AMARAS_STREAM = {
  sessionId: "fd0cba6c-0828-48e3-8510-c78146a5d449",
  lessonId: "9c1e77aa-1111-4222-8333-444455556666",
  sessionType: "lesson" as const,
  startedAt: "2026-10-19T09:00:00.000Z",
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  sent = [];
  push.mockReset();
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
      const body = url.includes("/student-entry/lookup") ? MATCHED : {};
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
  holdSignals("amara", AMARAS_STREAM, [
    {
      type: "feeling_checkin",
      timestamp: "2026-10-19T09:00:01.000Z",
      payload: { feeling: "tired" },
    },
  ]);
});

afterEach(async () => {
  clearSession();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function tobiTypesTheirPair() {
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

describe("05 Entry with another child's session still on the tablet", () => {
  it("ends that session before anything on 05 is sent", () => {
    render(
      <AuthProvider>
        <StudentEntryStep framing="school" />
      </AuthProvider>,
    );

    expect(getSession()).toBeNull();
  });

  it("sends nothing of Tobi's with Amara's token, and the lookup with none", async () => {
    render(
      <AuthProvider>
        <StudentEntryStep framing="school" />
      </AuthProvider>,
    );

    await tobiTypesTheirPair();

    const lookup = sent.filter((r) => r.url.includes("/student-entry/lookup"));
    expect(lookup).toHaveLength(1);
    expect(lookup[0].auth).toBeNull();
    // Nothing read or recorded as anybody: no consent read, no account read,
    // no session check, and no onboarding stream on Amara's account.
    expect(sent.some((r) => /consent-gate|users\/me|auth\/session/.test(r.url))).toBe(false);
    expect(
      sent.some((r) => r.url.includes("/api/signals") && r.body.includes('"onboarding"')),
    ).toBe(false);
    // The one request that carries her token is her own break feeling's last
    // try, on her own lesson's stream - the sign-out's, not Tobi's.
    const asAmara = sent.filter((r) => r.auth === "Bearer tok-amara");
    expect(asAmara).toHaveLength(1);
    expect(asAmara[0].url).toContain("/api/signals");
    expect(asAmara[0].body).toContain(AMARAS_STREAM.sessionId);
    expect(asAmara[0].body).toContain("feeling_checkin");
    // And Tobi is on into his own first run.
    expect(push).toHaveBeenCalledWith("/student/onboarding/sequence");
    expect(getOnboardingDraft()).toMatchObject({ name: "Tobi" });
  });
});
