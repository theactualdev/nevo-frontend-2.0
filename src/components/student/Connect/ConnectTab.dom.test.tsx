import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { ConnectTab } from "./ConnectTab";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * Connect, signed in, against the real thread hook and a stubbed API.
 *
 * What these pin is what the child is shown about a conversation, and what the
 * server is told they read:
 *
 * - [184] On a tablet the first thread opens beside the list. It was fetched -
 *   and the GET marks a thread read - while its row stayed unhighlighted with
 *   the unread dot on. On a phone the same fetch read the first thread while
 *   the child was still looking at the list.
 * - [185] A conversation still loading, or whose read failed, looked empty. And
 *   the history replaced the thread wholesale, so a message sent before it
 *   landed was erased - and a failed send vanished.
 * - [186] The bottom nav stayed up under the docked keyboard on a phone.
 * - [187] A link could not open a particular thread.
 */

const api = vi.hoisted(() => ({
  threads: vi.fn(),
  thread: vi.fn(),
  markThreadRead: vi.fn(),
  reply: vi.fn(),
  send: vi.fn(),
}));
vi.mock("@/lib/api/messages", () => ({ messagesApi: api }));

const row = (id: string, title: string, unread = false) => ({
  threadId: id,
  recipientType: "student",
  recipientId: null,
  title,
  className: null,
  latestPreview: unread ? "See you Thursday" : null,
  lastMessageAt: new Date().toISOString(),
  unread,
  unreadCount: unread ? 1 : 0,
});

const message = (id: string, content: string) => ({
  messageId: id,
  threadId: "t-1",
  senderId: "teacher-1",
  senderName: "Ms Okafor",
  content,
  createdAt: new Date().toISOString(),
});

/** A promise this test settles by hand. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const viewport = (twoPane: boolean) =>
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: twoPane && query === "(min-width: 768px)",
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );

beforeEach(() => {
  setSession({
    token: "tok-connect",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: "student-1",
    role: "student",
  });
  api.threads.mockResolvedValue({
    threads: [row("t-1", "Ms Okafor", true), row("t-2", "Mr Bell", true)],
    total: 2,
  });
  api.thread.mockResolvedValue({ threadId: "t-1", messages: [] });
  api.markThreadRead.mockImplementation(async (id: string) => ({
    ...row(id, "x"),
    unread: false,
  }));
  api.reply.mockResolvedValue(message("m-new", "hello"));
});

afterEach(() => {
  // Unmount before signing out, so no tab re-renders as a visitor mid-test.
  cleanup();
  clearSession();
  vi.clearAllMocks();
});

/** A thread's row in the list. Its name also heads the open conversation. */
const rowFor = (name: string) =>
  screen
    .getAllByRole("button")
    .find(
      (b) => b.hasAttribute("aria-current") && b.textContent?.includes(name),
    ) as HTMLButtonElement;

/** The conversation pane - the newest message also previews in its row. */
const conversation = () => document.querySelector("section") as HTMLElement;

const listed = (name: string) =>
  waitFor(() => expect(rowFor(name)).toBeTruthy());

describe("[184] the thread that opens beside the list", () => {
  it("is highlighted and marked read, as if tapped", async () => {
    viewport(true);
    render(<ConnectTab />);

    await waitFor(() => expect(api.thread).toHaveBeenCalledWith("t-1"));
    await waitFor(() =>
      expect(api.markThreadRead).toHaveBeenCalledWith("t-1"),
    );
    expect(rowFor("Ms Okafor")).toHaveAttribute("aria-current", "true");
    expect(within(rowFor("Ms Okafor")).queryByLabelText("Unread")).toBeNull();
    // The other thread is untouched.
    expect(rowFor("Mr Bell")).toHaveAttribute("aria-current", "false");
    expect(within(rowFor("Mr Bell")).getByLabelText("Unread")).toBeTruthy();
    expect(api.thread).not.toHaveBeenCalledWith("t-2");
  });
});

describe("[184] on a phone, the list", () => {
  it("reads nothing until the child opens a thread", async () => {
    viewport(false);
    render(<ConnectTab />);

    await listed("Ms Okafor");
    // Nothing is fetched (the GET marks read) and no row claims to be open.
    expect(api.thread).not.toHaveBeenCalled();
    expect(api.markThreadRead).not.toHaveBeenCalled();
    expect(rowFor("Ms Okafor")).toHaveAttribute("aria-current", "false");
    expect(within(rowFor("Ms Okafor")).getByLabelText("Unread")).toBeTruthy();

    fireEvent.click(rowFor("Mr Bell"));

    await waitFor(() => expect(api.thread).toHaveBeenCalledWith("t-2"));
    expect(api.markThreadRead).toHaveBeenCalledWith("t-2");
  });
});

describe("[185] [D104] a conversation's own read", () => {
  it("says it is loading rather than that it is empty", async () => {
    viewport(true);
    api.thread.mockReturnValue(new Promise(() => {}));
    render(<ConnectTab />);

    // D104, 8 Oct: the frame's spinner line, in place of the conversation.
    const loading = await screen.findByRole("status");
    expect(loading.textContent).toBe("Loading your messages…");
    expect(screen.queryByText("Message your teacher here")).toBeNull();
    // Nothing to write into until it has loaded.
    expect(screen.queryByLabelText("Message Ms Okafor")).toBeNull();
  });

  it("says it failed, and tries again on request", async () => {
    viewport(true);
    api.thread.mockRejectedValueOnce(new Error("offline"));
    render(<ConnectTab />);

    expect(
      await screen.findByText("We couldn't load this conversation"),
    ).toBeTruthy();
    // D104 draws the heading and Try again, and nothing else.
    expect(screen.queryByText(/Nothing is lost/)).toBeNull();
    expect(screen.queryByText("Message your teacher here")).toBeNull();
    expect(screen.queryByLabelText("Message Ms Okafor")).toBeNull();

    api.thread.mockResolvedValueOnce({
      threadId: "t-1",
      messages: [message("m-1", "Lovely work today")],
    });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    // It re-reads THIS conversation.
    expect(api.thread).toHaveBeenLastCalledWith("t-1");
    await waitFor(() =>
      expect(within(conversation()).getByText("Lovely work today")).toBeTruthy(),
    );
    expect(screen.getByLabelText("Message Ms Okafor")).toBeTruthy();
  });

  it("uses the frame's line only once it is known to be empty", async () => {
    viewport(true);
    render(<ConnectTab />);

    expect(await screen.findByText("Message your teacher here")).toBeTruthy();
  });

  it("offers the composer once it has loaded, and a failed send says so", async () => {
    viewport(true);
    const history = deferred<{ threadId: string; messages: unknown[] }>();
    const post = deferred<unknown>();
    api.thread.mockReturnValue(history.promise);
    api.reply.mockReturnValue(post.promise);
    render(<ConnectTab />);

    // D104: no composer while the conversation is still being read.
    await screen.findByRole("status");
    expect(screen.queryByLabelText("Message Ms Okafor")).toBeNull();

    await act(async () =>
      history.resolve({
        threadId: "t-1",
        messages: [message("m-1", "Lovely work today")],
      }),
    );
    const input = screen.getByLabelText("Message Ms Okafor");
    fireEvent.change(input, { target: { value: "Can we do more?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(within(conversation()).getByText("Lovely work today")).toBeTruthy();
    expect(within(conversation()).getByText("Can we do more?")).toBeTruthy();

    // And when the send then fails, there is still a bubble to say so.
    await act(async () => post.reject(new Error("offline")));
    expect(screen.getByText(/Didn.t send - tap to try again/)).toBeTruthy();
  });
});

describe("[186] the docked keyboard on a phone", () => {
  it("asks the shell to take the bottom nav down while it is up", async () => {
    viewport(false);
    render(<ConnectTab threadId="t-1" />);

    const input = await screen.findByLabelText("Message Ms Okafor");
    expect(document.querySelector("[data-nevo-hide-nav]")).toBeNull();

    fireEvent.focus(input);

    expect(document.querySelector("[data-nevo-hide-nav]")).not.toBeNull();
  });
});

describe("[187] a link to one thread", () => {
  it("opens that conversation on a phone, not the list", async () => {
    viewport(false);
    render(<ConnectTab threadId="t-2" />);

    await waitFor(() => expect(api.thread).toHaveBeenCalledWith("t-2"));
    expect(api.thread).not.toHaveBeenCalledWith("t-1");
    expect(await screen.findByLabelText("Message Mr Bell")).toBeTruthy();
  });

  it("falls back to the list for a thread that is not there", async () => {
    viewport(false);
    render(<ConnectTab threadId="t-gone" />);

    await listed("Ms Okafor");
    // Never someone else's conversation in its place.
    expect(api.thread).not.toHaveBeenCalled();
  });
});

describe("[79] a child nobody has written to", () => {
  it("is told what this place is and offered the first message (9 Oct)", async () => {
    // Design, 9 Oct: the old line told a child to wait for something they can
    // now start themselves.
    viewport(false);
    api.threads.mockResolvedValue({ threads: [], total: 0 });

    render(<ConnectTab />);

    expect(
      await screen.findByRole("heading", {
        name: "This is where you and your teacher talk",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Say hello, ask about a lesson, or tell them how it went. Write the first message whenever you're ready.",
      ),
    ).toBeTruthy();
    expect(screen.getByPlaceholderText("Write a message")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send" })).toBeTruthy();
    expect(screen.queryByText(/will be able to message you/)).toBeNull();
  });

  it("sees an empty thread's row say there are no messages yet", async () => {
    // A null \`latestPreview\` is a thread with no messages in it.
    viewport(false);
    api.threads.mockResolvedValue({
      threads: [row("t-1", "Ms Okafor", true), row("t-3", "Mrs Ade")],
      total: 2,
    });

    render(<ConnectTab />);

    await listed("Mrs Ade");
    expect(within(rowFor("Mrs Ade")).getByText("No messages yet")).toBeTruthy();
    expect(within(rowFor("Ms Okafor")).queryByText("No messages yet")).toBeNull();
  });
});

/*
 * B95 / D109: "Message my teacher" opens Connect ON the teacher's conversation.
 * Ask Nevo's answer names no teacher, so the thread list's own `teacherId`
 * marks it - only on a conversation with the child, and only when exactly one
 * qualifies. Anything else opens Connect as it always has.
 */
describe("[D109] Message my teacher", () => {
  const routed = (
    id: string,
    title: string,
    over: Record<string, unknown> = {},
  ) => ({ ...row(id, title), teacherId: "teacher-9", ...over });

  it("opens the teacher's conversation on a phone, not the list", async () => {
    viewport(false);
    api.threads.mockResolvedValue({
      threads: [
        row("t-1", "Ms Okafor"),
        routed("t-2", "Mr Bell", { unread: true, unreadCount: 1 }),
      ],
      total: 2,
    });
    render(<ConnectTab toTeacher />);

    await waitFor(() => expect(api.thread).toHaveBeenCalledWith("t-2"));
    expect(api.markThreadRead).toHaveBeenCalledWith("t-2");
    expect(api.thread).not.toHaveBeenCalledWith("t-1");
    expect(await screen.findByLabelText("Message Mr Bell")).toBeTruthy();
  });

  it("opens it beside the list on a tablet, over the first thread", async () => {
    viewport(true);
    api.threads.mockResolvedValue({
      threads: [row("t-1", "Ms Okafor"), routed("t-2", "Mr Bell")],
      total: 2,
    });
    render(<ConnectTab toTeacher />);

    await waitFor(() => expect(api.thread).toHaveBeenCalledWith("t-2"));
    expect(rowFor("Mr Bell")).toHaveAttribute("aria-current", "true");
    expect(api.thread).not.toHaveBeenCalledWith("t-1");
  });

  it("never picks a class thread, where a reply reaches the whole class", async () => {
    viewport(false);
    api.threads.mockResolvedValue({
      threads: [routed("t-1", "Year 5 Blue", { recipientType: "class" })],
      total: 1,
    });
    render(<ConnectTab toTeacher />);

    await listed("Year 5 Blue");
    // Let the open-thread effect run, so a wrong pick has its chance to fetch.
    await act(async () => {});
    expect(api.thread).not.toHaveBeenCalled();
  });

  it("does not choose between two teachers' conversations", async () => {
    viewport(false);
    api.threads.mockResolvedValue({
      threads: [
        routed("t-1", "Ms Okafor"),
        routed("t-2", "Mr Bell", { teacherId: "teacher-2" }),
      ],
      total: 2,
    });
    render(<ConnectTab toTeacher />);

    await listed("Ms Okafor");
    // Let the open-thread effect run, so a wrong pick has its chance to fetch.
    await act(async () => {});
    expect(api.thread).not.toHaveBeenCalled();
  });

  it("opens as it always has when no thread names a teacher", async () => {
    viewport(false);
    render(<ConnectTab toTeacher />);

    await listed("Ms Okafor");
    // Let the open-thread effect run, so a wrong pick has its chance to fetch.
    await act(async () => {});
    expect(api.thread).not.toHaveBeenCalled();
  });

  it("still lets the child open another conversation", async () => {
    viewport(false);
    api.threads.mockResolvedValue({
      threads: [row("t-1", "Ms Okafor"), routed("t-2", "Mr Bell")],
      total: 2,
    });
    render(<ConnectTab toTeacher />);

    await screen.findByLabelText("Message Mr Bell");
    fireEvent.click(screen.getByRole("button", { name: "Back to messages" }));
    fireEvent.click(rowFor("Ms Okafor"));

    await waitFor(() => expect(api.thread).toHaveBeenCalledWith("t-1"));
    expect(await screen.findByLabelText("Message Ms Okafor")).toBeTruthy();
  });
});

/*
 * B95, 9 Oct: a child with a teacher assigned has their teacher thread in the
 * list BEFORE its first message - empty, carrying its threadId and teacherId.
 * It is frame 29's "Connect (No messages)" for that teacher, and the child's
 * first message goes through the same reply route as every other.
 */
describe("[B95] the teacher thread before its first message", () => {
  const empty = {
    ...row("t-9", "Mr Bell"),
    recipientId: "student-1",
    teacherId: "teacher-9",
  };

  it("opens from Message my teacher, and takes the first message by reply", async () => {
    viewport(false);
    api.threads.mockResolvedValue({ threads: [empty], total: 1 });
    api.thread.mockResolvedValue({ threadId: "t-9", messages: [] });
    api.reply.mockResolvedValue({ ...message("m-1", "Hello"), threadId: "t-9" });
    render(<ConnectTab toTeacher />);

    // The frame: the teacher's name over the line and the composer.
    const input = await screen.findByLabelText("Message Mr Bell");
    expect(within(conversation()).getByText("Message your teacher here")).toBeTruthy();
    expect(within(conversation()).getByText("Mr Bell")).toBeTruthy();
    // Not the empty-list state: there IS a thread to write into.
    expect(
      screen.queryByText("This is where you and your teacher talk"),
    ).toBeNull();

    fireEvent.change(input, { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(api.reply).toHaveBeenCalledWith("t-9", "Hello");
    expect(api.send).not.toHaveBeenCalled();
    expect(await screen.findByText("Delivered")).toBeTruthy();
  });

});

/*
 * Design, 9 Oct: a child with no thread at all writes the first message from
 * the empty list. There is nothing to reply into, so it goes by direct
 * creation (B95, 9 Oct: `recipientType: "student"`, the child's OWN user id);
 * on success the list is read again and the thread it made opens. A failed
 * send keeps the words and offers the conversation's own retry.
 */
describe("[B95] the first message from an empty list", () => {
  const created = {
    ...row("t-new", "Mr Bell"),
    recipientId: "student-1",
    teacherId: "teacher-9",
    latestPreview: "Hello",
  };
  // `clearAllMocks` keeps unconsumed `...Once` answers, which would leak a
  // queued list into the next test whenever one of these fails early.
  afterEach(() => {
    api.threads.mockReset();
    api.send.mockReset();
  });
  const write = async (text: string) => {
    const input = await screen.findByPlaceholderText("Write a message");
    fireEvent.change(input, { target: { value: text } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
  };

  it("goes by direct creation, then opens the thread it made", async () => {
    viewport(false);
    api.threads
      .mockResolvedValueOnce({ threads: [], total: 0 })
      .mockResolvedValueOnce({ threads: [created], total: 1 });
    api.send.mockResolvedValue({ ...message("m-1", "Hello"), threadId: "t-new" });
    api.thread.mockResolvedValue({
      threadId: "t-new",
      messages: [{ ...message("m-1", "Hello"), senderId: "student-1" }],
    });
    render(<ConnectTab toTeacher />);

    await write("Hello");

    expect(api.send).toHaveBeenCalledWith({
      recipientType: "student",
      recipientId: "student-1",
      content: "Hello",
    });
    expect(api.reply).not.toHaveBeenCalled();
    // The list is read again, and the new conversation opens on a phone.
    await waitFor(() => expect(api.thread).toHaveBeenCalledWith("t-new"));
    expect(api.threads).toHaveBeenCalledTimes(2);
    expect(await screen.findByLabelText("Message Mr Bell")).toBeTruthy();
    expect(within(conversation()).getByText("Hello")).toBeTruthy();
  });

  it("keeps the words when it fails, and the retry sends them again", async () => {
    viewport(false);
    api.threads
      .mockResolvedValueOnce({ threads: [], total: 0 })
      .mockResolvedValueOnce({ threads: [created], total: 1 });
    api.send
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ...message("m-1", "Hello"), threadId: "t-new" });
    render(<ConnectTab />);

    await write("Hello");

    const retry = await screen.findByText(/Didn.t send - tap to try again/);
    expect(screen.getByText("Hello")).toBeTruthy();
    // Nothing was made, so nothing is read again or opened.
    expect(api.threads).toHaveBeenCalledTimes(1);

    fireEvent.click(retry);

    await waitFor(() => expect(api.send).toHaveBeenCalledTimes(2));
    expect(api.send).toHaveBeenLastCalledWith({
      recipientType: "student",
      recipientId: "student-1",
      content: "Hello",
    });
    expect(await screen.findByLabelText("Message Mr Bell")).toBeTruthy();
  });

  it("says delivered, and stays put, when the list does not answer after", async () => {
    viewport(false);
    api.threads
      .mockResolvedValueOnce({ threads: [], total: 0 })
      .mockRejectedValueOnce(new Error("offline"));
    api.send.mockResolvedValue({ ...message("m-1", "Hello"), threadId: "t-new" });
    render(<ConnectTab />);

    await write("Hello");

    expect(await screen.findByText("Delivered")).toBeTruthy();
    expect(screen.getByText("Hello")).toBeTruthy();
    expect(screen.queryByText(/Didn.t send/)).toBeNull();
  });
});
