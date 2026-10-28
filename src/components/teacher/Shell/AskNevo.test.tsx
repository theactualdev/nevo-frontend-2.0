import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { ask, threads, thread, getToken } = vi.hoisted(() => ({
  ask: vi.fn(),
  threads: vi.fn(),
  thread: vi.fn(),
  getToken: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/teacher/dashboard",
}));

// `asUuid` and `recentThreads` are the real ones on purpose: they are the two
// pieces of logic the drawer leans on, and stubbing them would test a drawer
// that does not exist.
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  askNevoApi: { ask, threads, thread, recordHelpfulness: vi.fn() },
}));
vi.mock("@/lib/auth/session", () => ({ getToken }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ school: "E2E Probe School" }),
}));

import { AskNevo } from "./AskNevo";

/**
 * Ask Nevo's conversation history (C15), and the thread-id bug underneath it.
 *
 * THE BUG THIS FILE EXISTS FOR. The drawer minted its own thread id -
 * `useRef(randomId())` - and sent it as `contextIds.threadId` on every turn.
 * `randomId` returns a real v4 UUID, so `asUuid` waved it through and no
 * request ever failed: the defect was completely silent. But the server issues
 * its OWN thread id and returns it on `AskResponse.threadId`, which this client
 * did not even have a field for. So every turn claimed to continue a
 * conversation the backend had never heard of, and the history list added here
 * could never have matched a stored thread back to the drawer that made it.
 *
 * The assertion is therefore about the REQUEST, not the rendering: a first turn
 * must carry no thread, and a second turn must carry the one the server sent
 * back. Asserting on what appears on screen would pass against the bug, because
 * the bug never changed what the teacher saw.
 *
 * The rest is history honesty. There is no fixture history in this repo and
 * there must never be one: elsewhere a failed read may show a designed screen
 * behind `data-nevo-sample`, because a fixture class is recognisably not yours.
 * A fixture CONVERSATION is not - it is words put in the teacher's mouth and in
 * Nevo's. So loading, empty and failed are three distinct states here and none
 * of them may borrow another's copy.
 */

const SERVER_THREAD = "6f1b2c3d-4e5a-4b6c-8d9e-0a1b2c3d4e5f";

const answer = (over: Record<string, unknown> = {}) => ({
  answer: ANSWER,
  questionCategory: "class_planning",
  interactionId: "11111111-2222-4333-8444-555555555555",
  aiGatewayCallId: "99999999-8888-4777-8666-555555555555",
  threadId: SERVER_THREAD,
  ...over,
});

const summary = (over: Record<string, unknown> = {}) => ({
  threadId: SERVER_THREAD,
  title: "What needs my attention today?",
  role: "teacher",
  messageCount: 2,
  lastMessageAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  ...over,
});

/** Open the drawer. Everything here happens inside it. */
const openDrawer = () => {
  render(<AskNevo />);
  fireEvent.click(screen.getByRole("button", { name: "Ask Nevo" }));
};

const askQuestion = (text: string) => {
  const input = screen.getByPlaceholderText("Ask about a student, class, or lesson");
  fireEvent.change(input, { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
};

/** The drawer holds an 850ms "thinking" beat before it commits an answer. */
const BEAT = 3_000;

const ANSWER = "Three things are worth your eye today.";

/**
 * Wait until `n` answers are ON SCREEN, not until `ask` has been called.
 *
 * The difference cost two failing tests: `ask()` returns early while
 * `thinking` is true, and `thinking` only clears once the beat has elapsed AND
 * the answer has committed. Waiting on the call count resolves the instant the
 * button is clicked, so the next question was silently refused and the test
 * asserted against a request that was never made.
 */
const settled = (n: number) =>
  waitFor(() => expect(screen.getAllByText(ANSWER)).toHaveLength(n), {
    timeout: BEAT,
  });

/**
 * jsdom implements no `scrollIntoView`, and the drawer calls it inside a
 * `requestAnimationFrame` after every turn - so the throw lands OUTSIDE the
 * test that caused it, as an unhandled exception naming a different test.
 * Adding a method jsdom simply lacks, per the note in `vitest.setup.ts`.
 */
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

beforeEach(() => {
  ask.mockReset();
  threads.mockReset();
  thread.mockReset();
  getToken.mockReset();
  getToken.mockReturnValue("a-token");
});

describe("the thread the drawer claims to be in", () => {
  it("sends no thread on the first question, rather than one it made up", async () => {
    ask.mockResolvedValue(answer());
    openDrawer();
    askQuestion("What needs my attention today?");

    await waitFor(() => expect(ask).toHaveBeenCalledTimes(1), { timeout: BEAT });
    expect(ask.mock.calls[0][0].contextIds.threadId).toBeNull();
  });

  it("continues the thread the SERVER opened, not one of its own", async () => {
    ask.mockResolvedValue(answer());
    openDrawer();
    askQuestion("What needs my attention today?");
    await settled(1);

    askQuestion("And for JSS 2A?");
    await settled(2);

    expect(ask).toHaveBeenCalledTimes(2);
    expect(ask.mock.calls[1][0].contextIds.threadId).toBe(SERVER_THREAD);
  });

  it("keeps the thread it holds when a later answer carries none", async () => {
    // `threadId` is nullable on the contract. A response without one must not
    // wipe a thread already in hand, or a three-turn conversation would split
    // into two in the history list.
    ask.mockResolvedValueOnce(answer());
    ask.mockResolvedValueOnce(answer({ threadId: null }));
    ask.mockResolvedValue(answer({ threadId: null }));
    openDrawer();

    askQuestion("first");
    await settled(1);
    askQuestion("second");
    await settled(2);
    askQuestion("third");
    await settled(3);

    expect(ask).toHaveBeenCalledTimes(3);
    expect(ask.mock.calls[2][0].contextIds.threadId).toBe(SERVER_THREAD);
  });

  it("starts a new thread after the drawer is closed", async () => {
    // Closing clears the transcript, per the frame. A thread surviving that
    // would silently append the next question to a conversation the teacher
    // believes they ended.
    ask.mockResolvedValue(answer());
    openDrawer();
    askQuestion("first");
    await settled(1);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Ask Nevo" }));
    askQuestion("unrelated question");
    await settled(1); // the transcript was cleared, so this is the only one

    expect(ask).toHaveBeenCalledTimes(2);
    expect(ask.mock.calls[1][0].contextIds.threadId).toBeNull();
  });
});

describe("past conversations", () => {
  it("does not claim the list is empty while it is still loading", async () => {
    // The distinction the whole nullable-vs-[] design exists for. Showing
    // "your past conversations will appear here" and then four of them a beat
    // later tells a teacher something false about their own record.
    threads.mockReturnValue(new Promise(() => {}));
    openDrawer();
    fireEvent.click(screen.getByRole("button", { name: "Past conversations" }));

    expect(
      screen.queryByText(/Your past conversations with Ask Nevo will appear here/i),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("status", { name: /Loading past conversations/i })).toBeInTheDocument();
  });

  it("says so when the list cannot be read, and invents no conversations", async () => {
    threads.mockRejectedValue(new Error("500"));
    openDrawer();
    fireEvent.click(screen.getByRole("button", { name: "Past conversations" }));

    await waitFor(() =>
      expect(screen.getByText(/couldn’t load your past conversations/i)).toBeInTheDocument(),
    );
    // A failure must not borrow the empty state's words: "you have none" and
    // "we could not look" are different things to tell a teacher.
    expect(
      screen.queryByText(/Your past conversations with Ask Nevo will appear here/i),
    ).not.toBeInTheDocument();
  });

  it("shows the frame's empty state when there genuinely are none", async () => {
    threads.mockResolvedValue([]);
    openDrawer();
    fireEvent.click(screen.getByRole("button", { name: "Past conversations" }));

    await waitFor(() =>
      expect(
        screen.getByText("Your past conversations with Ask Nevo will appear here."),
      ).toBeInTheDocument(),
    );
  });

  it("lists what came back, and opens one read-only", async () => {
    threads.mockResolvedValue([summary()]);
    thread.mockResolvedValue({
      threadId: SERVER_THREAD,
      title: "What needs my attention today?",
      role: "teacher",
      createdAt: new Date().toISOString(),
      messages: [
        {
          messageId: "m-2",
          author: "nevo",
          sequence: 2,
          text: "Tunde stalled on Tuesday.",
          blocks: [],
          createdAt: new Date().toISOString(),
        },
        {
          messageId: "m-1",
          author: "asker",
          sequence: 1,
          text: "What needs my attention today?",
          blocks: [],
          createdAt: new Date().toISOString(),
        },
      ],
    });

    openDrawer();
    fireEvent.click(screen.getByRole("button", { name: "Past conversations" }));

    const row = await screen.findByRole("button", {
      name: /What needs my attention today\?/i,
    });
    fireEvent.click(row);

    await waitFor(() =>
      expect(screen.getByText("Tunde stalled on Tuesday.")).toBeInTheDocument(),
    );
    expect(thread).toHaveBeenCalledWith(SERVER_THREAD);
    // Read-only: a transcript carries no interaction id, so offering a vote
    // would offer a control that could record nothing.
    expect(screen.queryByRole("button", { name: "Helpful" })).not.toBeInTheDocument();
  });

  // Teslim 09a29d8: "Do the same for live replies AND reopened history." A
  // stored answer's `text` is the same Markdown a live one carries.
  it("opens a past answer with its list and emphasis, as it was shown", async () => {
    threads.mockResolvedValue([summary()]);
    thread.mockResolvedValue({
      threadId: SERVER_THREAD,
      title: "What needs my attention today?",
      role: "teacher",
      createdAt: new Date().toISOString(),
      messages: [
        {
          messageId: "m-1",
          author: "asker",
          sequence: 1,
          // A teacher's own words are never read as Markdown.
          text: "What about **JSS 2A**?",
          blocks: [],
          createdAt: new Date().toISOString(),
        },
        {
          messageId: "m-2",
          author: "nevo",
          sequence: 2,
          text: "Two things:\n\n1. Tunde **stalled** on Tuesday.\n2. Amara finished early.",
          blocks: [],
          createdAt: new Date().toISOString(),
        },
      ],
    });

    openDrawer();
    fireEvent.click(screen.getByRole("button", { name: "Past conversations" }));
    fireEvent.click(await screen.findByRole("button", { name: /What needs my attention today\?/i }));

    const items = await screen.findAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      "Tunde stalled on Tuesday.",
      "Amara finished early.",
    ]);
    expect(items[0].closest("ol")).not.toBeNull();
    expect(items[0].querySelector("strong")?.textContent).toBe("stalled");
    expect(screen.getByText("What about **JSS 2A**?")).toBeInTheDocument();
  });

  it("orders a transcript by sequence, not by the order it arrived", async () => {
    threads.mockResolvedValue([summary()]);
    thread.mockResolvedValue({
      threadId: SERVER_THREAD,
      title: "t",
      role: "teacher",
      createdAt: new Date().toISOString(),
      messages: [
        { messageId: "m-2", author: "nevo", sequence: 2, text: "SECOND", blocks: [], createdAt: new Date().toISOString() },
        { messageId: "m-1", author: "asker", sequence: 1, text: "FIRST", blocks: [], createdAt: new Date().toISOString() },
      ],
    });

    openDrawer();
    fireEvent.click(screen.getByRole("button", { name: "Past conversations" }));
    fireEvent.click(await screen.findByRole("button", { name: /t/i }));

    await waitFor(() => expect(screen.getByText("FIRST")).toBeInTheDocument());
    const body = screen.getByText("FIRST").compareDocumentPosition(
      screen.getByText("SECOND"),
    );
    // Node.DOCUMENT_POSITION_FOLLOWING
    expect(body & 4).toBeTruthy();
  });

  it("walks back from a conversation to the list, then to the chat", async () => {
    threads.mockResolvedValue([summary()]);
    thread.mockResolvedValue({
      threadId: SERVER_THREAD,
      title: "What needs my attention today?",
      role: "teacher",
      createdAt: new Date().toISOString(),
      messages: [],
    });

    openDrawer();
    fireEvent.click(screen.getByRole("button", { name: "Past conversations" }));
    fireEvent.click(
      await screen.findByRole("button", { name: /What needs my attention today\?/i }),
    );

    // Back once: the list again.
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /What needs my attention today\?/i }),
      ).toBeInTheDocument(),
    );

    // Back twice: the chat, with the history control offered again.
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "Past conversations" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
  });

  it("asks nothing of the API when there is no session", async () => {
    // Signed out there is no history to fetch, and a 401 is not a thing worth
    // showing a teacher who simply has not signed in.
    getToken.mockReturnValue(null);
    openDrawer();
    fireEvent.click(screen.getByRole("button", { name: "Past conversations" }));

    await waitFor(() =>
      expect(
        screen.getByText("Your past conversations with Ask Nevo will appear here."),
      ).toBeInTheDocument(),
    );
    expect(threads).not.toHaveBeenCalled();
  });

  it("returns to the chat when a question is asked from history", async () => {
    // "with the prompt field still there to start something new" - the new
    // question must not appear to append to the read-only transcript on screen.
    threads.mockResolvedValue([]);
    ask.mockResolvedValue(answer());
    openDrawer();
    fireEvent.click(screen.getByRole("button", { name: "Past conversations" }));
    await screen.findByText("Your past conversations with Ask Nevo will appear here.");

    askQuestion("something new");

    expect(
      screen.queryByText("Your past conversations with Ask Nevo will appear here."),
    ).not.toBeInTheDocument();
    expect(screen.getByText("something new")).toBeInTheDocument();
  });
});
