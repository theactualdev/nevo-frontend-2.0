import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AskNevo } from "./AskNevo";

/**
 * THE DRAWER HAD NO MEMORY OF ANY CONVERSATION A CHILD HAD EVER HAD WITH IT.
 *
 * `askNevoApi.threads`, `.thread` and `recentThreads` have been typed and
 * wrapped since the endpoints shipped, and nothing called them - the thirteenth
 * instance this week of something written on the wire and read by nobody.
 *
 * Frame 26 states the surface exactly: *"A quiet clock icon in the drawer's top
 * bar opens a flat, most-recent-first list of past conversations inside the
 * same sheet. Tapping an entry opens it read-only, with the input still there
 * to start something new. Same drawer, same styling: no new screen, no modal.
 * Nothing older than 90 days, up to 50 entries."*
 *
 * The window and the cap are enforced in `recentThreads` and tested there - the
 * endpoint takes no parameters, so the rule cannot be asked for.
 */

const threadsCall = vi.hoisted(() => vi.fn());
const threadCall = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/askNevo", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/api/askNevo")>();
  return {
    ...actual,
    askNevoApi: {
      ...actual.askNevoApi,
      ask: vi.fn().mockResolvedValue({ answer: "…", threadId: null }),
      threads: (...a: unknown[]) => threadsCall(...a),
      thread: (...a: unknown[]) => threadCall(...a),
    },
  };
});

const signedIn = vi.hoisted(() => ({ value: true }));
vi.mock("@/hooks/useHasSession", () => ({
  useHasSession: () => signedIn.value,
}));

const token = vi.hoisted(() => ({ value: "tok" as string | undefined }));
vi.mock("@/lib/auth/session", () => ({ getToken: () => token.value }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/student/dashboard",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks", () => ({ useAuth: () => ({ user: { id: "stu-1" } }) }));

const now = Date.now();
const summary = (over: Record<string, unknown> = {}) => ({
  threadId: "t-1",
  title: "Why do plants need light?",
  role: "student",
  messageCount: 4,
  lastMessageAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
  createdAt: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
  ...over,
});

const openDrawer = () => {
  render(<AskNevo />);
  fireEvent.click(screen.getAllByRole("button", { name: /ask nevo/i })[0]);
};

const openHistory = async () => {
  openDrawer();
  fireEvent.click(screen.getByRole("button", { name: "Past conversations" }));
};

beforeAll(() => {
  Element.prototype.scrollTo = () => {};
});

beforeEach(() => {
  signedIn.value = true;
  token.value = "tok";
  threadsCall.mockReset().mockResolvedValue([summary()]);
  threadCall.mockReset().mockResolvedValue({
    threadId: "t-1",
    title: "Why do plants need light?",
    role: "student",
    createdAt: new Date(now).toISOString(),
    messages: [
      {
        messageId: "m-1",
        author: "asker",
        sequence: 1,
        text: "Why do plants need light?",
        createdAt: new Date(now).toISOString(),
      },
      {
        messageId: "m-2",
        author: "nevo",
        sequence: 2,
        text: "They use it to make their own food.",
        createdAt: new Date(now).toISOString(),
      },
    ],
  });
});

afterEach(() => {
  cleanup();
});

describe("looking back at a past conversation", () => {
  it("offers a way in from the drawer's top bar", () => {
    openDrawer();

    expect(
      screen.getByRole("button", { name: "Past conversations" }),
    ).toBeInTheDocument();
  });

  it("lists what the child has asked before", async () => {
    await openHistory();

    expect(
      await screen.findByRole("button", { name: /Why do plants need light/ }),
    ).toBeInTheDocument();
  });

  it("opens one read-only, with both sides of it", async () => {
    await openHistory();
    fireEvent.click(
      await screen.findByRole("button", { name: /Why do plants need light/ }),
    );

    expect(
      await screen.findByText("They use it to make their own food."),
    ).toBeInTheDocument();
  });

  it("leaves the composer there to start something new", async () => {
    /*
     * Frame 26: "with the input still there to start something new". History
     * is somewhere to look, not somewhere to be stuck - so the composer lives
     * outside the view switch entirely.
     */
    await openHistory();
    fireEvent.click(
      await screen.findByRole("button", { name: /Why do plants need light/ }),
    );

    expect(
      screen.getByPlaceholderText(/ask/i) ?? screen.getByRole("textbox"),
    ).toBeInTheDocument();
  });

  it("stays in the same sheet rather than opening a screen", () => {
    // "Same drawer, same styling: no new screen, no modal."
    void openHistory();

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });
});

describe("what the list says when there is nothing to say", () => {
  it("tells a child with no history that there is none yet", async () => {
    threadsCall.mockResolvedValue([]);

    await openHistory();

    expect(await screen.findByText(/Nothing here yet/i)).toBeInTheDocument();
  });

  it("does not call a failed read an empty history", async () => {
    /*
     * The distinction this drawer already draws elsewhere: could not ask is
     * not the same as nothing to show. A child who has talked to Nevo every
     * day must never be told they never have because a request failed.
     */
    threadsCall.mockRejectedValue(new Error("offline"));

    await openHistory();

    expect(
      await screen.findByText(/couldn.t load these just now/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Nothing here yet/i)).toBeNull();
  });

  it("says so when one conversation will not open", async () => {
    threadCall.mockRejectedValue(new Error("offline"));

    await openHistory();
    fireEvent.click(
      await screen.findByRole("button", { name: /Why do plants need light/ }),
    );

    expect(
      await screen.findByText(/couldn.t open that one just now/i),
    ).toBeInTheDocument();
  });
});

describe("a visitor with no account", () => {
  it("is offered no history at all", () => {
    /*
     * The designed walkthrough has no server history behind it. A clock here
     * would open an empty list that reads as a child with no conversations
     * rather than a visitor with no account - and the request would 401.
     */
    signedIn.value = false;
    token.value = undefined;

    openDrawer();

    expect(
      screen.queryByRole("button", { name: "Past conversations" }),
    ).toBeNull();
  });

  it("asks the server for nothing", () => {
    signedIn.value = false;
    token.value = undefined;

    openDrawer();

    expect(threadsCall).not.toHaveBeenCalled();
  });
});
