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
 * WHAT A SIGNED-IN CHILD IS TOLD WHEN ASK NEVO CANNOT ANSWER.
 *
 * They were given a canned tutoring reply - fractions and pizza - marked as a
 * sample in small italics, and a question about their teacher got a promise to
 * "let them know" that nothing would keep. A child cannot weigh "sample"
 * against something that sounds exactly like help. Now: no answer, said
 * plainly. The canned engine stays for the signed-out walkthrough only.
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

const signedIn = vi.hoisted(() => ({ value: true }));
vi.mock("@/hooks/useHasSession", () => ({
  useHasSession: () => signedIn.value,
}));
vi.mock("@/lib/auth/session", () => ({ getToken: () => "tok" }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/student/dashboard",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks", () => ({
  useAuth: () => ({ user: { id: "stu-1" } }),
  useSignals: () => ({ trackEvent: vi.fn(), flush: vi.fn() }),
}));

const askSomething = async (question: string) => {
  render(<AskNevo />);
  fireEvent.click(screen.getAllByRole("button", { name: /ask nevo/i })[0]);
  fireEvent.change(screen.getByLabelText("Ask a question"), {
    target: { value: question },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  // Past the thinking beat, with the failure already in.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });
};

beforeAll(() => {
  Element.prototype.scrollTo = () => {};
});

beforeEach(() => {
  vi.useFakeTimers();
  signedIn.value = true;
  ask.mockReset().mockRejectedValue(new Error("offline"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("a signed-in child whose question could not be answered", () => {
  it("is told so plainly, and given no invented tutoring", async () => {
    await askSomething("Can you explain it differently?");

    expect(screen.getByText(/couldn.t answer that just now/i)).toBeVisible();
    expect(document.body.textContent).not.toMatch(/pizza/i);
    expect(document.body.textContent).not.toMatch(/sample answer/i);
  });

  it("is not promised a message to their teacher that nothing will send", async () => {
    await askSomething("Can my teacher help me?");

    expect(document.body.textContent).not.toMatch(/let them know/i);
    expect(
      screen.queryByRole("button", { name: "Message my teacher" }),
    ).toBeNull();
  });

  it("carries no sample mark, because nothing invented is shown", async () => {
    await askSomething("Can you explain it differently?");

    expect(document.querySelector("[data-nevo-sample]")).toBeNull();
  });
});

describe("the signed-out walkthrough", () => {
  it("still answers from the marked sample engine", async () => {
    signedIn.value = false;

    await askSomething("Can you explain it differently?");

    expect(document.body.textContent).toMatch(/pizza/i);
    expect(document.querySelector("[data-nevo-sample]")).not.toBeNull();
  });
});

/**
 * B33 and D45. Once the day's allowance is spent the server answers 429
 * `ask_nevo_daily_limit`, and design ruled the child is told plainly that they
 * have asked everything for today and can ask again tomorrow - never a
 * connection failure. Before this, it read "Try asking again in a moment",
 * which sends a child to keep trying something that cannot work until
 * tomorrow.
 */
describe("a child whose questions for today are used up", () => {
  const spent = () =>
    new ApiError(429, "Too many", {
      detail: {
        code: "ask_nevo_daily_limit",
        message: "You have used today's questions.",
        resetsAt: "2026-10-07T00:00:00Z",
      },
    });

  it("is told they have asked everything for today, and can ask again tomorrow", async () => {
    ask.mockReset().mockRejectedValue(spent());

    await askSomething("What is a fraction?");

    expect(
      screen.getByText(
        "You've asked everything for today. You can ask again tomorrow.",
      ),
    ).toBeVisible();
  });

  it("is never shown it as a failure to connect or answer", async () => {
    ask.mockReset().mockRejectedValue(spent());

    await askSomething("What is a fraction?");

    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/couldn.t answer|couldn.t connect|in a moment|on us/i);
    expect(document.querySelector("[data-nevo-sample]")).toBeNull();
  });

  it("is told the same on the walkthrough, because the server said so", async () => {
    signedIn.value = false;
    ask.mockReset().mockRejectedValue(spent());

    await askSomething("Can you explain it differently?");

    expect(screen.getByText(/asked everything for today/)).toBeVisible();
    expect(document.body.textContent).not.toMatch(/pizza/i);
  });
});

describe("a rate limit that is not the allowance", () => {
  it("still says to try again in a moment, because it does clear", async () => {
    // Told apart by its code, not its status: both are 429.
    ask
      .mockReset()
      .mockRejectedValue(
        new ApiError(429, "Too many", {
          detail: { code: "too_many_requests", message: "slow down" },
        }),
      );

    await askSomething("What is a fraction?");

    expect(screen.getByText(/couldn.t answer that just now/i)).toBeVisible();
    expect(screen.queryByText(/asked everything for today/)).toBeNull();
  });
});
