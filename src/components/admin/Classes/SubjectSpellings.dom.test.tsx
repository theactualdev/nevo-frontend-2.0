import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";
import type { SpellingQuestion } from "@/lib/api/subjects";

/**
 * D05's subject spellings: every open pair on one card, Same or Different on
 * each, and an answered pair saying what it settled.
 */

const { questions, answer } = vi.hoisted(() => ({ questions: vi.fn(), answer: vi.fn() }));
vi.mock("@/lib/api/subjects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/subjects")>();
  return {
    ...actual,
    subjectsApi: {
      ...actual.subjectsApi,
      spellingQuestions: () => questions(),
      answerSpelling: (id: string, same: boolean) => answer(id, same),
    },
  };
});

import { SubjectSpellings } from "./SubjectSpellings";

const q = (id: string, otherName: string, keptName: string): SpellingQuestion => ({
  id,
  otherName,
  keptName,
  question: `${otherName} and ${keptName}, same subject or different?`,
});

beforeEach(() => {
  questions.mockReset().mockResolvedValue([
    q("q1", "Maths", "Mathematics"),
    q("q2", "Civics", "Civic Education"),
  ]);
  answer.mockReset().mockResolvedValue([]);
});

/** The pair's row - its first mention is the question; an answer repeats the names. */
const row = (text: RegExp) => screen.getAllByText(text)[0].closest("li") as HTMLElement;

describe("subject spellings", () => {
  it("lists every open pair on one card", async () => {
    render(<SubjectSpellings paused={false} />);
    expect(await screen.findByText("Your teacher file spells 2 subjects two ways")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(row(/Maths/)).toHaveTextContent("Maths and Mathematics: same subject or different?");
  });

  it("settles Same as one subject, under the spelling the server keeps", async () => {
    render(<SubjectSpellings paused={false} />);
    await screen.findByText(/spells 2 subjects/);
    fireEvent.click(within(row(/Maths/)).getByRole("button", { name: "Same" }));
    await waitFor(() => expect(row(/Maths/)).toHaveTextContent("One subject: Mathematics."));
    expect(answer).toHaveBeenCalledWith("q1", true);
    // No claim about which spelling the file used most: the server keeps the fuller one.
    expect(screen.queryByText(/most of your file/)).toBeNull();
  });

  it("settles Different as two subjects, as the school wrote them", async () => {
    render(<SubjectSpellings paused={false} />);
    await screen.findByText(/spells 2 subjects/);
    fireEvent.click(within(row(/Civics/)).getByRole("button", { name: "Different" }));
    await waitFor(() =>
      expect(row(/Civics/)).toHaveTextContent(
        "Two subjects, kept exactly as your school wrote them: Civics and Civic Education.",
      ),
    );
    expect(answer).toHaveBeenCalledWith("q2", false);
  });

  it("keeps the question and says so when an answer doesn't save", async () => {
    answer.mockRejectedValue(new Error("down"));
    render(<SubjectSpellings paused={false} />);
    await screen.findByText(/spells 2 subjects/);
    fireEvent.click(within(row(/Maths/)).getByRole("button", { name: "Same" }));
    expect(await screen.findByText(/didn.t save, and nothing changed/)).toBeInTheDocument();
    expect(within(row(/Maths/)).getByRole("button", { name: "Same" })).toBeEnabled();
  });

  it("says a pair someone else answered first is done", async () => {
    answer.mockRejectedValue(
      new ApiError(409, "Conflict", { detail: { code: "question_already_answered", message: "…" } }),
    );
    render(<SubjectSpellings paused={false} />);
    await screen.findByText(/spells 2 subjects/);
    fireEvent.click(within(row(/Maths/)).getByRole("button", { name: "Same" }));
    expect(await screen.findByText("Already answered.")).toBeInTheDocument();
  });

  it("is absent when nothing is waiting, or the read fails", async () => {
    questions.mockResolvedValue([]);
    const { container, unmount } = render(<SubjectSpellings paused={false} />);
    await waitFor(() => expect(questions).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    unmount();

    questions.mockRejectedValue(new Error("down"));
    const second = render(<SubjectSpellings paused={false} />);
    await waitFor(() => expect(questions).toHaveBeenCalledTimes(2));
    expect(second.container).toBeEmptyDOMElement();
  });

  it("can't be answered while setup pauses changes", async () => {
    render(<SubjectSpellings paused />);
    await screen.findByText(/spells 2 subjects/);
    expect(within(row(/Maths/)).getByRole("button", { name: "Same" })).toBeDisabled();
  });
});
