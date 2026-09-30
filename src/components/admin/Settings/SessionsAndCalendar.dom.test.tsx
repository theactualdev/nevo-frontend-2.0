import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { AccountSettings } from "./AccountSettings";

/**
 * Two states on the sessions list, both of which cost an admin something.
 *
 * Signing a device out fired on the first press and named no consequence -
 * and every row reads "Another device", because the contract carries no
 * device name at all. One misread row ends the session someone is working in.
 *
 * And a single session rendered as a one-row list with nothing to do on it,
 * where the answer an admin wants is simply that there is nowhere else signed
 * in as them.
 */

const sessions = vi.fn();
const endSession = vi.fn();
const endOthers = vi.fn();

vi.mock("@/lib/api/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/auth")>();
  return {
    ...actual,
    authApi: {
      ...actual.authApi,
      sessions: () => sessions(),
      endSession: (id: string) => endSession(id),
      endOtherSessions: () => endOthers(),
    },
  };
});

vi.mock("@/lib/api/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/permissions")>();
  return {
    ...actual,
    permissionsApi: { ...actual.permissionsApi, me: async () => ({ scopes: [] }) },
  };
});

vi.mock("@/lib/api/users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/users")>();
  return {
    ...actual,
    usersApi: {
      ...actual.usersApi,
      me: async () => ({
        id: "u1",
        email: "head@brightgate.edu.ng",
        firstName: "Folake",
        lastName: "Adebayo",
        displayName: "Folake Adebayo",
        role: "admin",
      }),
    },
  };
});

const session = (id: string, current: boolean) => ({
  id,
  current,
  lastSeenAt: "2026-09-15T09:00:00Z",
});

beforeEach(() => {
  sessions.mockReset();
  endSession.mockReset();
  endSession.mockResolvedValue(undefined);
  endOthers.mockReset();
  endOthers.mockResolvedValue(undefined);
});

function button(container: HTMLElement, label: string) {
  return Array.from(container.querySelectorAll("button")).find(
    (b) => (b.textContent ?? "").trim() === label,
  );
}

describe("signing a device out", () => {
  it("asks first, and says what happens", async () => {
    sessions.mockResolvedValue([session("s1", true), session("s2", false)]);
    const { container } = render(<AccountSettings />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Another device/));

    fireEvent.click(button(container, "End it")!);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/will be signed out/),
    );
    expect(visibleText(container)).toMatch(/Nothing of theirs is lost/);
    // Nothing has happened yet.
    expect(endSession).not.toHaveBeenCalled();
  });

  it("only ends it on the confirm", async () => {
    sessions.mockResolvedValue([session("s1", true), session("s2", false)]);
    const { container } = render(<AccountSettings />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Another device/));

    fireEvent.click(button(container, "End it")!);
    await waitFor(() => expect(button(container, "Sign it out")).toBeTruthy());
    fireEvent.click(button(container, "Sign it out")!);
    await waitFor(() => expect(endSession).toHaveBeenCalledWith("s2"));
  });

  it("backs out without ending anything", async () => {
    sessions.mockResolvedValue([session("s1", true), session("s2", false)]);
    const { container } = render(<AccountSettings />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Another device/));

    fireEvent.click(button(container, "End it")!);
    await waitFor(() => expect(button(container, "Keep it")).toBeTruthy());
    fireEvent.click(button(container, "Keep it")!);
    await waitFor(() =>
      expect(visibleText(container)).not.toMatch(/will be signed out/),
    );
    expect(endSession).not.toHaveBeenCalled();
  });
});

describe("a single session", () => {
  it("answers the question instead of listing one row", async () => {
    sessions.mockResolvedValue([session("s1", true)]);
    const { container } = render(<AccountSettings />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/only device signed in as you/),
    );
    expect(visibleText(container)).not.toMatch(/This device/);
    expect(button(container, "Sign out everywhere else")).toBeUndefined();
  });

  it("still lists them once there is more than one", async () => {
    sessions.mockResolvedValue([session("s1", true), session("s2", false)]);
    const { container } = render(<AccountSettings />);
    await waitFor(() => expect(visibleText(container)).toMatch(/This device/));
    expect(visibleText(container)).not.toMatch(/only device signed in as you/);
  });

  it("does not claim a single session when the read failed", async () => {
    // An empty list is "we could not tell you", not "you are signed in once".
    sessions.mockResolvedValue([]);
    const { container } = render(<AccountSettings />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/couldn't list your sessions/),
    );
    expect(visibleText(container)).not.toMatch(/only device signed in as you/);
  });
});

describe("when signing a device out does not go through", () => {
  it("keeps the confirm open and says nothing changed", async () => {
    sessions.mockResolvedValue([session("s1", true), session("s2", false)]);
    endSession.mockRejectedValue(new Error("500"));
    const { container } = render(<AccountSettings />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Another device/));

    fireEvent.click(button(container, "End it")!);
    await waitFor(() => expect(button(container, "Sign it out")).toBeTruthy());
    fireEvent.click(button(container, "Sign it out")!);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/didn.t sign it out, and nothing has changed/),
    );
    // Still there to try again - closing it is what success looks like.
    expect(button(container, "Sign it out")).toBeTruthy();
  });

  it("says when signing out everywhere else failed", async () => {
    sessions.mockResolvedValue([session("s1", true), session("s2", false)]);
    endOthers.mockRejectedValue(new Error("500"));
    const { container } = render(<AccountSettings />);
    await waitFor(() => expect(button(container, "Sign out everywhere else")).toBeTruthy());
    fireEvent.click(button(container, "Sign out everywhere else")!);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/didn.t sign anything out, and nothing has changed/),
    );
  });

  it("says this device stayed signed in when everywhere else is done", async () => {
    sessions.mockResolvedValueOnce([session("s1", true), session("s2", false)]);
    sessions.mockResolvedValue([session("s1", true)]);
    const { container } = render(<AccountSettings />);
    await waitFor(() => expect(button(container, "Sign out everywhere else")).toBeTruthy());
    fireEvent.click(button(container, "Sign out everywhere else")!);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/Every other session is signed out. You.re still signed in here/),
    );
  });
});
