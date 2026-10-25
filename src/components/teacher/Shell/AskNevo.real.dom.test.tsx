import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { ask, getToken, path, signedIn } = vi.hoisted(() => ({
  ask: vi.fn(),
  getToken: vi.fn(),
  path: { value: "/teacher/dashboard" },
  signedIn: { value: true },
}));

vi.mock("next/navigation", () => ({ usePathname: () => path.value }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  askNevoApi: { ask, threads: vi.fn(), thread: vi.fn(), recordHelpfulness: vi.fn() },
}));
vi.mock("@/lib/auth/session", () => ({ getToken }));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => signedIn.value }));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ school: "E2E Probe School" }),
}));

import { AskNevo } from "./AskNevo";
import { setAskNevoClass } from "./askNevoScope";
import { ASK_NEVO_CONTEXTS, CANNOT_HELP_LINE } from "@/lib/mocks/teacherAskNevo";

/**
 * ASK NEVO ON A REAL TEACHER'S REAL PAGES.
 *
 * Signed in, the drawer greeted every real student page with the frame's
 * child - "You're viewing: Amara Okafor", "Ask me about Amara" - because its
 * strip resolved real ids through fixture lookups. It never told the
 * assistant which record was open. And a question that failed was answered
 * with the frame's canned reply about invented children.
 */

const STUDENT = "0b6f1c2d-3e4a-4b5c-8d6e-7f8091a2b3c4";
const CLASS = "1c7a2d3e-4f5b-4c6d-9e7f-8091a2b3c4d5";
const LESSON = "2d8b3e4f-5a6c-4d7e-8f90-91a2b3c4d5e6";

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

const openOn = (pathname: string) => {
  path.value = pathname;
  render(<AskNevo />);
  fireEvent.click(screen.getByRole("button", { name: "Ask Nevo" }));
};

const askQuestion = (text: string) => {
  fireEvent.change(screen.getByPlaceholderText("Ask about a student, class, or lesson"), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
};

const answer = (over: Record<string, unknown> = {}) => ({
  answer: "An answer about this child.",
  questionCategory: "profile_pattern",
  interactionId: "11111111-2222-4333-8444-555555555555",
  aiGatewayCallId: "99999999-8888-4777-8666-555555555555",
  threadId: null,
  canHelp: true,
  ...over,
});

beforeEach(() => {
  ask.mockReset();
  getToken.mockReset().mockReturnValue("a-token");
  signedIn.value = true;
});

describe("the drawer on a real student's page", () => {
  it("names no invented child", () => {
    openOn(`/teacher/students/${STUDENT}`);

    expect(screen.queryByText(/Amara/)).not.toBeInTheDocument();
    expect(screen.queryByText(/You.re viewing/)).not.toBeInTheDocument();
  });

  it("asks about 'this student' instead", () => {
    openOn(`/teacher/students/${STUDENT}`);

    expect(screen.getByText("Ask me about this student.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /What.s going on with this student\?/ })).toBeInTheDocument();
  });

  it("tells the assistant which student is open", async () => {
    ask.mockResolvedValue(answer());
    openOn(`/teacher/students/${STUDENT}`);
    askQuestion("What's going on?");

    await waitFor(() => expect(ask).toHaveBeenCalled(), { timeout: 3000 });
    expect(ask.mock.calls[0][0].contextIds).toEqual(
      expect.objectContaining({ studentId: STUDENT }),
    );
  });
});

describe("the drawer on other real records", () => {
  it("names no invented lesson on a real lesson", () => {
    openOn(`/teacher/lessons/${LESSON}`);

    expect(screen.queryByText(/Fractions in Everyday Life/)).not.toBeInTheDocument();
  });

  it("sends the lesson the teacher has open", async () => {
    ask.mockResolvedValue(answer());
    openOn(`/teacher/lessons/${LESSON}`);
    askQuestion("Is this right for my class?");

    await waitFor(() => expect(ask).toHaveBeenCalled(), { timeout: 3000 });
    expect(ask.mock.calls[0][0].contextIds).toEqual(
      expect.objectContaining({ lessonId: LESSON }),
    );
  });

  it("sends the class the teacher has open", async () => {
    ask.mockResolvedValue(answer());
    openOn(`/teacher/classes/${CLASS}`);
    askQuestion("How is this class doing?");

    await waitFor(() => expect(ask).toHaveBeenCalled(), { timeout: 3000 });
    expect(ask.mock.calls[0][0].contextIds).toEqual(
      expect.objectContaining({ classId: CLASS }),
    );
  });

  it("names no invented class on Insights", () => {
    openOn("/teacher/insights");

    expect(screen.getByText("You're on: Insights")).toBeInTheDocument();
    expect(screen.queryByText(/JSS 2A/)).not.toBeInTheDocument();
  });

  it("treats the assign flow as the library, not a lesson record", () => {
    openOn("/teacher/lessons/assign");

    expect(screen.getByText(ASK_NEVO_CONTEXTS.library.strip)).toBeInTheDocument();
  });

  it("sends no sample slug as if it were a real id", async () => {
    ask.mockResolvedValue(answer());
    openOn("/teacher/students/amara-okafor");
    askQuestion("What's going on?");

    await waitFor(() => expect(ask).toHaveBeenCalled(), { timeout: 3000 });
    expect(ask.mock.calls[0][0].contextIds.studentId).toBeUndefined();
  });

  it("sends no record for a page that is not one", async () => {
    ask.mockResolvedValue(answer());
    openOn("/teacher/dashboard");
    askQuestion("What needs me?");

    await waitFor(() => expect(ask).toHaveBeenCalled(), { timeout: 3000 });
    const ids = ask.mock.calls[0][0].contextIds;
    expect(ids.studentId).toBeUndefined();
    expect(ids.classId).toBeUndefined();
    expect(ids.lessonId).toBeUndefined();
  });
});

describe("a question that got no answer", () => {
  it("says so, and invents no reply", async () => {
    ask.mockRejectedValue(new Error("network"));
    openOn("/teacher/dashboard");
    askQuestion("What needs my attention today?");

    expect(
      await screen.findByText(/couldn.t reach Nevo just now. Try asking again/, {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Tunde/)).not.toBeInTheDocument();
    expect(screen.queryByText(/sample answer/)).not.toBeInTheDocument();
  });
});

describe("the signed-out walkthrough", () => {
  beforeEach(() => {
    signedIn.value = false;
    getToken.mockReturnValue(undefined);
    ask.mockRejectedValue(new Error("no session"));
  });

  it("keeps the frame's own child", () => {
    openOn("/teacher/students/amara-okafor");

    expect(screen.getByText("Ask me about Amara.")).toBeInTheDocument();
  });

  it("still answers with the designed reply", async () => {
    openOn("/teacher/dashboard");
    askQuestion("What needs my attention today?");

    expect(await screen.findByText(/Tunde stalled on Tuesday/, {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it("says the can't-help line once, as the frame draws it", async () => {
    openOn("/teacher/dashboard");
    askQuestion("Can I see the billing invoice?");

    await screen.findByText(CANNOT_HELP_LINE, {}, { timeout: 3000 });
    expect(screen.getAllByText(/Your school admin looks after that side of things/)).toHaveLength(1);
  });
});

/**
 * A STRUCTURED ANSWER KEEPS ITS SHAPE (Teslim 09a29d8, 25 Oct). The drawer
 * picked `plainText` and printed it in one `<p>`, which flattened headings,
 * lists, spacing and emphasis. It draws the Markdown answer by block now -
 * and only as text, never as HTML.
 */
describe("a structured answer", () => {
  it("draws its heading, list, bold and code as such", async () => {
    ask.mockResolvedValue(
      answer({
        answer: "**This week**\n\n- Check **JSS 2A**\n- Open `Fractions 3`\n\nThen plan Monday.",
        plainText: "This week\n• Check JSS 2A\n• Open Fractions 3\nThen plan Monday.",
        answerFormat: "structured",
      }),
    );
    openOn("/teacher/dashboard");
    askQuestion("Give me a list");

    const items = await screen.findAllByRole("listitem", {}, { timeout: 3000 });
    expect(items.map((li) => li.textContent)).toEqual(["Check JSS 2A", "Open Fractions 3"]);
    expect(items[0].querySelector("strong")?.textContent).toBe("JSS 2A");
    expect(items[1].querySelector("code")?.textContent).toBe("Fractions 3");
    expect(screen.getByText("This week")).toHaveClass("font-semibold");
    expect(screen.getByText("Then plan Monday.")).toBeInTheDocument();
    // No markup reaches the page as characters, either.
    expect(screen.queryByText(/\*\*|`/)).not.toBeInTheDocument();
  });

  it("shows markup in an answer as text, never as HTML", async () => {
    ask.mockResolvedValue(
      answer({ answer: "Try <img src=x onerror=alert(1)> and <script>alert(1)</script>." }),
    );
    openOn("/teacher/dashboard");
    askQuestion("Tell me");

    expect(
      await screen.findByText(/<script>alert\(1\)<\/script>/, {}, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(document.querySelector("img[src='x']")).toBeNull();
    expect(document.querySelector("script")).toBeNull();
  });

  it("falls back to the plain text when the answer itself is empty", async () => {
    ask.mockResolvedValue(answer({ answer: "", plainText: "One, then two." }));
    openOn("/teacher/dashboard");
    askQuestion("Tell me");

    expect(await screen.findByText("One, then two.", {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it("reads the answer itself when it is plain", async () => {
    ask.mockResolvedValue(answer({ answer: "Just a sentence.", plainText: "", answerFormat: "plain" }));
    openOn("/teacher/dashboard");
    askQuestion("Tell me");

    expect(await screen.findByText("Just a sentence.", {}, { timeout: 3000 })).toBeInTheDocument();
  });
});

describe("the walkthrough's own sentences", () => {
  it("credit no version of a lesson to any child", () => {
    const all = Object.values(ASK_NEVO_CONTEXTS)
      .flatMap((c) => [c.strip, c.lead, c.sub, c.answer, ...c.chips])
      .join(" ");
    expect(all).not.toMatch(/listen-first|audio-led/i);
  });
});

/**
 * T182. Insights chooses its class in place - the address stays
 * /teacher/insights - so the drawer asked about nothing in particular beside a
 * page about one class.
 */
describe("a class chosen in place on the screen", () => {
  afterEach(() => setAskNevoClass(null));

  it("is the class the assistant is told about", async () => {
    ask.mockResolvedValue(answer());
    setAskNevoClass(CLASS);
    openOn("/teacher/insights");
    askQuestion("Who needs me?");

    await waitFor(() => expect(ask).toHaveBeenCalled(), { timeout: 3000 });
    expect(ask.mock.calls[0][0].contextIds).toEqual(expect.objectContaining({ classId: CLASS }));
  });

  it("gives way to the class the address names", async () => {
    ask.mockResolvedValue(answer());
    setAskNevoClass("9f8e7d6c-5b4a-4f3e-8d2c-1b0a99887766");
    openOn(`/teacher/classes/${CLASS}`);
    askQuestion("Who needs me?");

    await waitFor(() => expect(ask).toHaveBeenCalled(), { timeout: 3000 });
    expect(ask.mock.calls[0][0].contextIds.classId).toBe(CLASS);
  });

  it("sends no class that is not a real id", async () => {
    ask.mockResolvedValue(answer());
    setAskNevoClass("jss-2a");
    openOn("/teacher/insights");
    askQuestion("Who needs me?");

    await waitFor(() => expect(ask).toHaveBeenCalled(), { timeout: 3000 });
    expect(ask.mock.calls[0][0].contextIds.classId).toBeUndefined();
  });
});
