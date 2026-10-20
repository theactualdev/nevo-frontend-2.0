import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConsentWithdrawn } from "./ConsentWithdrawn";
import { WAITING_WAY_BACK, WaitingOnConsent } from "./WaitingOnConsent";
import StudentUnavailablePage from "@/app/student/unavailable/page";
import { clearSession, setSession } from "@/lib/auth/session";
import { fakeIndexedDb } from "@/test/fakeIndexedDb";

const signOut = vi.hoisted(() => vi.fn());
vi.mock("@/hooks", () => ({ useAuth: () => ({ signOut }) }));

/**
 * 00e Consent Withdrawn (D117): "a calm, still dot rather than the breathing
 * one, no 'soon', no countdown, no button, no sign-in route. It never uses the
 * word consent, never mentions a parent, never mentions withdrawal, and never
 * implies a decision was made about the child by anybody."
 *
 * With one thing the frame does not draw: a Back (Lydia, 17 Oct).
 */

afterEach(() => {
  cleanup();
  clearSession();
  signOut.mockReset();
});

describe("ConsentWithdrawn", () => {
  it("says what 00e says, verbatim", () => {
    render(<ConsentWithdrawn />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Nevo isn't available to you at the moment",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Someone at home or at school can tell you more."),
    ).toBeInTheDocument();
  });

  it("is not 00d: no soon, and a still dot rather than the breathing one", () => {
    render(<ConsentWithdrawn />);

    expect(document.body.textContent).not.toMatch(/soon|ready|wait/i);
    const dot = document.querySelector("span[aria-hidden='true']");
    expect(dot).toBeTruthy();
    expect(dot?.className).not.toMatch(/animate/);
  });

  it("names no consent, parent, withdrawal or decision", () => {
    render(<ConsentWithdrawn />);

    expect(document.body.textContent).not.toMatch(
      /consent|parent|withdr|decid|removed|permission/i,
    );
  });

  it("offers nothing onward and no way to sign in - Back is the only thing to press", () => {
    render(<ConsentWithdrawn />);

    expect(
      screen.getAllByRole("button").map((b) => b.getAttribute("aria-label")),
    ).toEqual(["Back"]);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(document.querySelector("form, input")).toBeNull();
  });

  it("is the page a withdrawn child is sent to", () => {
    render(<StudentUnavailablePage />);

    expect(
      screen.getByRole("heading", {
        name: "Nevo isn't available to you at the moment",
      }),
    ).toBeInTheDocument();
  });
});

/**
 * Lydia, 17 Oct: "Consent Withdrawn: yes, give it Back, same as
 * waiting-on-consent." And in her order of work: "Same ruling as
 * waiting-on-consent. A shared device should not be stuck." 00d's Back
 * (D189) goes to the device picker, signing a signed-in child out first.
 */
describe("its way back", () => {
  it("is a Back, labelled, top left before anything else on the screen", () => {
    render(<ConsentWithdrawn />);

    const back = screen.getByRole("button", { name: "Back" });
    expect(back.className).toContain("size-11");
    expect(back.querySelector("svg")).toBeTruthy();
    // First in the reading order, ahead of the heading: the top-left corner.
    expect(
      back.compareDocumentPosition(screen.getByRole("heading", { level: 1 })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("is 00d's row, wordmark and all, so the two holds cannot drift apart", () => {
    const rowOf = () =>
      screen.getByRole("button", { name: "Back" }).parentElement?.outerHTML;

    render(<ConsentWithdrawn />);
    const withdrawn = rowOf();
    cleanup();
    render(<WaitingOnConsent />);

    expect(withdrawn).toBeTruthy();
    expect(withdrawn).toBe(rowOf());
    expect(withdrawn).toContain('alt="Nevo"');
  });

  it("signs a child sent here from a door out first, then goes to the device picker", () => {
    // `/student/unavailable` is only reachable signed in: the refused request,
    // the sign-in doors and the entry check all send a child with a session.
    setSession({
      token: "tok",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      userId: "student-1",
      role: "student",
    });
    render(<StudentUnavailablePage />);

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(signOut).toHaveBeenCalledTimes(1);
    // jsdom will not let a test observe `location.assign`, so the
    // destination is pinned where the row reads it.
    expect(WAITING_WAY_BACK).toBe("/auth/login");
  });

  it("goes to the picker without signing anyone out for a child held in place on 05 Entry", () => {
    // 05 draws 00e in place for a child who has no session to end.
    render(<ConsentWithdrawn />);

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(signOut).not.toHaveBeenCalled();
  });
});

/*
 * NOTHING OF THEIRS IS KEPT ON ARRIVAL (19 Oct browser-storage audit). A run
 * under way when the withdrawal landed left its raw taps in IndexedDB: the
 * page holding the capture was left before it could stop it. 00e lets them
 * go, whichever way the child arrived.
 */
describe("00e — the baseline's raw taps a run left", () => {
  it("are purged when 00e opens", async () => {
    const idb = fakeIndexedDb();
    vi.stubGlobal("indexedDB", idb.factory);
    idb.seed("nevo-baseline", [
      [
        "baseline-run-1",
        {
          capturedAt: Date.now(),
          events: [{ kind: "tap", t: 1, payload: { x: 120, y: 340 } }],
        },
      ],
    ]);
    try {
      render(<ConsentWithdrawn />);

      await vi.waitFor(() =>
        expect(idb.records("nevo-baseline")?.size).toBe(0),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
