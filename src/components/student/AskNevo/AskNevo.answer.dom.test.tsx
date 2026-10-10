import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { AskNevo } from "./AskNevo";
import { offendingCalls } from "@/test/signalCatalogue";

/**
 * WHAT THE DRAWER DOES WITH AN ANSWER THAT ARRIVED.
 *
 * Three things the server says and the student drawer did not hear: the
 * thread it opened, whether it could help, and - once it could not - that
 * "Message my teacher" leaves the drawer for Connect rather than sitting open
 * over it.
 */

const ask = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/askNevo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/askNevo")>();
  return {
    ...actual,
    askNevoApi: {
      ...actual.askNevoApi,
      ask: (...a: unknown[]) => ask(...a),
      threads: vi.fn().mockResolvedValue([]),
      thread: vi.fn(),
    },
  };
});

vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));
vi.mock("@/lib/auth/session", () => ({ getToken: () => "tok" }));
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  usePathname: () => "/student/dashboard",
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));
const { trackEvent, useSignals } = vi.hoisted(() => {
  const trackEvent = vi.fn();
  return {
    trackEvent,
    useSignals: vi.fn(() => ({ trackEvent, flush: vi.fn() })),
  };
});
const auth = vi.hoisted(() => ({ user: { id: "stu-1" } }));
vi.mock("@/hooks", () => ({
  useAuth: () => auth,
  useSignals,
}));

const SERVER_THREAD = "0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e";

const answer = (over: Record<string, unknown> = {}) => ({
  answer: "Light is what the leaf uses to make food.",
  canHelp: true,
  cannotHelpReason: null,
  questionCategory: "lesson_help",
  interactionId: "11111111-1111-4111-8111-111111111111",
  aiGatewayCallId: "22222222-2222-4222-8222-222222222222",
  threadId: SERVER_THREAD,
  ...over,
});

const send = async (question: string) => {
  fireEvent.change(screen.getByLabelText("Ask a question"), {
    target: { value: question },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  // Past the thinking beat, with the answer in.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
};

const open = () => {
  render(<AskNevo />);
  fireEvent.click(screen.getAllByRole("button", { name: /ask nevo/i })[0]);
};

const sentThread = (call: number) =>
  (ask.mock.calls[call]?.[0] as { contextIds: { threadId: string | null } })
    .contextIds.threadId;

beforeAll(() => {
  Element.prototype.scrollTo = () => {};
});

beforeEach(() => {
  vi.useFakeTimers();
  push.mockReset();
  trackEvent.mockReset();
  useSignals.mockClear();
  auth.user = { id: "stu-1" };
  ask.mockReset().mockResolvedValue(answer());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the conversation's thread", () => {
  it("is not one the drawer made up", async () => {
    // A first turn has no thread to continue. It sent a random UUID here.
    open();
    await send("Why do leaves need light?");

    expect(sentThread(0)).toBeNull();
  });

  it("is the server's, from the next turn on", async () => {
    open();
    await send("Why do leaves need light?");
    await send("And at night?");

    expect(sentThread(1)).toBe(SERVER_THREAD);
  });

  it("is kept when a later answer carries none", async () => {
    open();
    await send("Why do leaves need light?");
    ask.mockResolvedValueOnce(answer({ threadId: null }));
    await send("And at night?");
    await send("And in winter?");

    expect(sentThread(2)).toBe(SERVER_THREAD);
  });
});

describe("an answer the server says it cannot help with", () => {
  it("is shown, with the way to the teacher beside it", async () => {
    ask.mockResolvedValue(
      answer({
        answer: "That's something your teacher can help with best.",
        canHelp: false,
        cannotHelpReason: "needs_teacher",
      }),
    );
    open();
    await send("Can you tell my teacher I'm finding this hard?");

    expect(
      screen.getByText("That's something your teacher can help with best."),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Message my teacher" }),
    ).toBeVisible();
  });

  it("never shows the reason, which no frame draws", async () => {
    ask.mockResolvedValue(
      answer({ canHelp: false, cannotHelpReason: "needs_teacher" }),
    );
    open();
    await send("Can you tell my teacher?");

    expect(document.body.textContent).not.toMatch(/needs_teacher/);
  });

  it("offers no hand-over when the server could help", async () => {
    open();
    await send("Why do leaves need light?");

    expect(
      screen.queryByRole("button", { name: "Message my teacher" }),
    ).toBeNull();
  });
});

describe("Message my teacher", () => {
  it("closes the drawer on its way to Connect", async () => {
    // IA 31: "Message my teacher -> closes drawer -> Connect Tab". The drawer
    // lives in the shell, so it stayed open over the tab it had sent them to.
    ask.mockResolvedValue(answer({ canHelp: false }));
    open();
    await send("Can you tell my teacher?");

    fireEvent.click(screen.getByRole("button", { name: "Message my teacher" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(push).toHaveBeenCalledWith("/student/connect");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

/*
 * ASK NEVO IS SIGNAL IN ITS OWN RIGHT (design D29), on its own `ask_nevo`
 * session (1 Oct). The drawer sent nothing: a child reaching for help, being
 * told Nevo could not, and taking the way to the teacher left no trace.
 */
describe("what the drawer tells the engine", () => {
  const types = () => trackEvent.mock.calls.map(([type]) => type);

  it("opens its own ask_nevo session, not a lesson's", () => {
    open();

    const [id, lessonId, type] = useSignals.mock.calls[0] as unknown as [
      string,
      string | undefined,
      string,
    ];
    expect(type).toBe("ask_nevo");
    expect(lessonId).toBeUndefined();
    // The ingest contract takes nothing but a UUID.
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-/i);
  });

  it("says a question was asked, and never what it was", async () => {
    open();
    await send("Why do leaves need light?");

    expect(types()).toEqual(["ask_nevo_question_student"]);
    expect(JSON.stringify(trackEvent.mock.calls)).not.toMatch(/leaves/);
    // Where it was asked - the catalogue's `currentPage` - with the server's
    // own id and category for it, which arrive with the answer (B93).
    expect(trackEvent).toHaveBeenCalledWith("ask_nevo_question_student", {
      interactionId: "11111111-1111-4111-8111-111111111111",
      currentPage: "/student/dashboard",
      questionCategory: "lesson_help",
    });
  });

  it("goes up as the answer lands, not after the thinking beat", async () => {
    open();
    fireEvent.change(screen.getByLabelText("Ask a question"), {
      target: { value: "Why do leaves need light?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    // Nothing yet: the id and the category do not exist until it answers.
    expect(types()).toEqual([]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(types()).toEqual(["ask_nevo_question_student"]);
  });

  it("says only what is known of a question that got no answer", async () => {
    ask.mockRejectedValue(new Error("offline"));
    open();
    await send("Why do leaves need light?");

    // Asked, and where - never an id or a category the server never gave.
    expect(trackEvent).toHaveBeenCalledWith("ask_nevo_question_student", {
      currentPage: "/student/dashboard",
    });
  });

  it("names the child who asked, when the id is a real one", async () => {
    auth.user = { id: "33333333-3333-4333-8333-333333333333" };
    open();
    await send("Why do leaves need light?");

    expect(trackEvent).toHaveBeenCalledWith("ask_nevo_question_student", {
      interactionId: "11111111-1111-4111-8111-111111111111",
      studentId: "33333333-3333-4333-8333-333333333333",
      currentPage: "/student/dashboard",
      questionCategory: "lesson_help",
    });
  });

  it("says when the server could not help, with the server's own id", async () => {
    ask.mockResolvedValue(answer({ canHelp: false }));
    open();
    await send("Can you tell my teacher?");

    expect(trackEvent).toHaveBeenCalledWith("ask_nevo_cannot_help", {
      interactionId: "11111111-1111-4111-8111-111111111111",
      role: "student",
      currentPage: "/student/dashboard",
    });
    // Once: not again from a state update React may run twice.
    expect(types().filter((t) => t === "ask_nevo_cannot_help")).toHaveLength(1);
  });

  it("says nothing of the kind when the server could help", async () => {
    open();
    await send("Why do leaves need light?");

    expect(types()).not.toContain("ask_nevo_cannot_help");
  });

  it("says when the child took the way to their teacher", async () => {
    ask.mockResolvedValue(answer({ canHelp: false }));
    open();
    await send("Can you tell my teacher?");

    fireEvent.click(screen.getByRole("button", { name: "Message my teacher" }));

    expect(trackEvent).toHaveBeenLastCalledWith("ask_nevo_redirect_used", {
      interactionId: "11111111-1111-4111-8111-111111111111",
      role: "student",
      currentPage: "/student/dashboard",
      redirectTarget: "/student/connect",
    });
    // All three, held to the keys the catalogue declares for each.
    expect(offendingCalls(trackEvent.mock.calls)).toEqual([]);
  });
});

describe("the drawer's own controls", () => {
  it("are at least 44px to touch", async () => {
    // They were 36 and 40. jsdom lays nothing out, so the size class is the
    // only thing there is to read.
    ask.mockResolvedValue(answer({ canHelp: false }));
    open();
    expect(
      screen.getByRole("button", { name: "Past conversations" }).className,
    ).toMatch(/\bsize-11\b/);

    await send("Can you tell my teacher?");
    expect(
      screen.getByRole("button", { name: "Message my teacher" }).className,
    ).toMatch(/\bh-11\b/);
  });
});
