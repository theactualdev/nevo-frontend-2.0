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
    // A role refusal is no longer one of these: it reads Lydia's line,
    // "Ask Nevo is not available on this account." (25 Nov, L55 - see the
    // failure tests). Another learner's context still is.
    [
      "a 403 for another learner's context",
      new ApiError(403, "Forbidden", {
        detail: { code: "student_context_forbidden", message: "Student Ask Nevo must use the current student." },
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

/**
 * Lydia, 26 Nov, shipped by the backend (c1b775d, live in 6c6b3fc): a
 * child's block carries one of two reasons, names_person or trusted_adult,
 * and its message is her line for it. The app shows the server's message for
 * every block, and no line of its own for any reason.
 */
describe("a child's block, in the server's words whatever its reason", () => {
  const NAMES_LINE =
    "I can't talk about other people. Ask me again without the name and I'll help.";
  const ADULT_LINE =
    "I can't help with this one. Please talk to a trusted adult, like your teacher or someone at home.";
  /** The app's own lines of 25 Nov, retired. */
  const RETIRED = /outside what I can help with|doesn.t use people.s names/i;
  const blockedFor = (message: string, reason?: string) =>
    new ApiError(403, "Forbidden", {
      detail: {
        code: "content_safety_blocked",
        message,
        ...(reason === undefined ? {} : { reason }),
      },
    });
  const reads = async (refusal: ApiError) => {
    ask.mockRejectedValue(refusal);
    open();
    await send(BLOCKED);
    return screen.getByRole("status").textContent;
  };

  it("names_person: the server's line for a name", async () => {
    expect(await reads(blockedFor(NAMES_LINE, "names_person"))).toBe(NAMES_LINE);
    expect(document.body.textContent).not.toMatch(RETIRED);
  });

  it("trusted_adult: the server's trusted-adult line", async () => {
    expect(await reads(blockedFor(ADULT_LINE, "trusted_adult"))).toBe(ADULT_LINE);
  });

  it("no reason, as an older server sends: the server's line", async () => {
    expect(await reads(blockedFor(SERVER_WORDS))).toBe(SERVER_WORDS);
  });

  it("a reason this build has never seen: the server's line", async () => {
    expect(await reads(blockedFor(ADULT_LINE, "a_category_added_next_year"))).toBe(ADULT_LINE);
  });

  it.each(["other", "names_person", "trusted_adult", undefined])(
    "never a line of the app's own, for reason %s",
    async (reason) => {
      expect(await reads(blockedFor("Words the server chose.", reason))).toBe(
        "Words the server chose.",
      );
      expect(document.body.textContent).not.toMatch(RETIRED);
    },
  );
});
