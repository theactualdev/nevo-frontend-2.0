import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { AskNevo } from "./AskNevo";
import { ApiError } from "@/lib/api/client";

/**
 * SCRUM-259: WHAT A CHILD IS SHOWN WHEN THE SAFETY CHECK STOPS A QUESTION.
 *
 * The backend answers 403 `content_safety_blocked` with a message written for
 * the child. The drawer threw it away and showed its ordinary failure - "that's
 * on us, not you. Try asking again in a moment" - so a child who had just
 * disclosed something was told the product broke and invited to say it again.
 *
 * Now the stop is a screen of its own: the server's words, no retry, the
 * question off the screen and never sent again. Every other refusal keeps the
 * ordinary failure exactly as it was.
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
vi.mock("next/navigation", () => ({
  usePathname: () => "/student/dashboard",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks", () => ({
  useAuth: () => ({ user: { id: "stu-1" } }),
  useSignals: () => ({ trackEvent: vi.fn(), flush: vi.fn() }),
}));

/** The backend's `SafetyBlocked.public_message`, curly apostrophe and all. */
const SERVER_WORDS =
  "Nevo can’t help with this one. Please talk to a trusted adult or your teacher.";
const BLOCKED = "something a child should never have to say twice";

/** Anything the ordinary failure says, or any invitation to go again. */
const FAILURE_WORDS = /couldn.t answer|try asking again|in a moment|on us|try again|retry/i;

const stopped = (message?: string) =>
  new ApiError(403, "Forbidden", {
    detail: {
      code: "content_safety_blocked",
      ...(message === undefined ? {} : { message }),
    },
  });

const answer = {
  answer: "Osmosis is water moving across a membrane.",
  canHelp: true,
  cannotHelpReason: null,
  questionCategory: "lesson_help",
  interactionId: "11111111-1111-4111-8111-111111111111",
  aiGatewayCallId: "22222222-2222-4222-8222-222222222222",
  threadId: null,
};

const open = () => {
  render(<AskNevo />);
  fireEvent.click(screen.getAllByRole("button", { name: /ask nevo/i })[0]);
};

const send = async (question: string) => {
  fireEvent.change(screen.getByLabelText("Ask a question"), {
    target: { value: question },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  // Past the thinking beat, with the response in.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
};

const questionsSent = () =>
  ask.mock.calls.map(([payload]) => (payload as { question: string }).question);

beforeAll(() => {
  Element.prototype.scrollTo = () => {};
});

beforeEach(() => {
  vi.useFakeTimers();
  ask.mockReset();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("a question the safety check stops", () => {
  it("shows the server's own words, exactly, and announces them", async () => {
    ask.mockRejectedValue(stopped(SERVER_WORDS));
    open();

    await send(BLOCKED);

    expect(screen.getByRole("status").textContent).toBe(SERVER_WORDS);
    expect(screen.getByText(SERVER_WORDS)).toBeVisible();
  });

  it("takes the words from the server, never from a copy of its own", async () => {
    ask.mockRejectedValue(stopped("Words the server chose for this stop."));
    open();

    await send(BLOCKED);

    expect(screen.getByRole("status").textContent).toBe(
      "Words the server chose for this stop.",
    );
    expect(document.body.textContent).not.toMatch(/trusted adult/i);
  });

  it("offers no retry, and none of the ordinary failure's words", async () => {
    ask.mockRejectedValue(stopped(SERVER_WORDS));
    open();

    await send(BLOCKED);

    expect(document.body.textContent).not.toMatch(FAILURE_WORDS);
    expect(
      screen.queryByRole("button", { name: /try again|retry|ask again/i }),
    ).toBeNull();
  });

  it("is a screen of its own: not a turn in the thread, and not the prompts", async () => {
    ask.mockRejectedValue(stopped(SERVER_WORDS));
    open();

    await send(BLOCKED);

    expect(screen.queryByText(BLOCKED)).toBeNull();
    expect(screen.queryByText("What can I help with?")).toBeNull();
    expect(screen.queryByRole("button", { name: "Give me a hint" })).toBeNull();
  });

  it("never sends the blocked question again, nor hands it back to the composer", async () => {
    ask.mockRejectedValueOnce(stopped(SERVER_WORDS)).mockResolvedValue(answer);
    open();

    await send(BLOCKED);
    // Long past any timeout or beat: nothing resends on its own.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(ask).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Ask a question")).toHaveValue("");

    // Something new is asked as itself, and the stop gives way to the thread.
    await send("What is osmosis?");

    expect(questionsSent()).toEqual([BLOCKED, "What is osmosis?"]);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("What is osmosis?")).toBeVisible();
    expect(screen.getByText(answer.answer)).toBeVisible();
    // The stopped question did not wait underneath to come back with it, and
    // nor did a failed turn for it.
    expect(screen.queryByText(BLOCKED)).toBeNull();
    expect(document.body.textContent).not.toMatch(FAILURE_WORDS);

    // And it was put nowhere on the device.
    const kept = [window.localStorage, window.sessionStorage]
      .flatMap((store) =>
        Array.from({ length: store.length }, (_, i) => store.getItem(store.key(i)!)),
      )
      .join("\n");
    expect(kept).not.toContain(BLOCKED);
  });

  it("with no words from the server, shows the stop empty rather than invent any", async () => {
    ask.mockRejectedValue(stopped());
    open();

    await send(BLOCKED);

    expect(screen.getByRole("status").textContent).toBe("");
    expect(document.body.textContent).not.toMatch(FAILURE_WORDS);
    expect(document.body.textContent).not.toMatch(/trusted adult/i);
  });
});

describe("every other refusal keeps the ordinary failure, with its line to try again", () => {
  it.each([
    [
      "a 403 that is a role refusal",
      new ApiError(403, "Forbidden", {
        detail: { code: "ask_role_forbidden", message: "You cannot ask Nevo in that role." },
      }),
    ],
    ["a 403 that names no code", new ApiError(403, "Forbidden")],
    [
      "the stop's code on a 500",
      new ApiError(500, "Server", {
        detail: { code: "content_safety_blocked", message: SERVER_WORDS },
      }),
    ],
    ["a 500", new ApiError(500, "Server")],
  ])("%s", async (_, refusal) => {
    ask.mockRejectedValue(refusal);
    open();

    await send("What is a fraction?");

    expect(screen.getByText(/couldn.t answer that just now/i)).toBeVisible();
    expect(screen.getByText(/try asking again in a moment/i)).toBeVisible();
    // Still a turn in the thread, under the question it answers.
    expect(screen.getByText("What is a fraction?")).toBeVisible();
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.body.textContent).not.toMatch(/trusted adult/i);
  });
});
