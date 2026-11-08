import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QuestionsLeftOut, questionsLeftOut } from "./QuestionsLeftOut";

/**
 * The questions the parse left out (`question_unusable` review notes), in the
 * server's own words (Hub, 8 Nov). Without them, Teslim's fix makes a lesson
 * quietly shorter.
 */

// The server's sentence, as `content_parsing/service.py` writes it today.
const SERVER_SENTENCE =
  "Nevo could not turn these questions into something a child can answer and have marked, so they were left out of the lesson. The rest of the lesson is unaffected. An open question with no single right answer is the usual reason; add it back as a discussion point if you want it.";

const unusable = (over: Record<string, unknown> = {}) => ({
  code: "question_unusable",
  textRetained: true,
  questionCount: 2,
  questions: ["Why do you think metals feel cold?", "a question that was not structured"],
  message: SERVER_SENTENCE,
  ...over,
});

const technical = [
  { code: "ai_parse_fallback", message: "This chunk used deterministic parsing because the AI could not return valid structured lesson data.", chunkNumber: 2 },
  { code: "page_text_missing", pageNumbers: [4] },
  { code: "depth_variants_failed", segmentKey: "k-1" },
  { code: "audio_generation_failed", message: "Audio could not be generated." },
];

describe("which notes are a teacher's", () => {
  it("keeps question_unusable, with its sentence and questions as sent", () => {
    expect(questionsLeftOut([...technical, unusable()])).toEqual([
      {
        message: SERVER_SENTENCE,
        questions: ["Why do you think metals feel cold?", "a question that was not structured"],
      },
    ]);
  });

  it("leaves every technical note out", () => {
    expect(questionsLeftOut(technical)).toEqual([]);
  });

  it("reads nothing from a missing or malformed list", () => {
    expect(questionsLeftOut(undefined)).toEqual([]);
    expect(questionsLeftOut(null)).toEqual([]);
    expect(questionsLeftOut([null, 3, "question_unusable"])).toEqual([]);
  });

  it("drops a question that isn't text, rather than printing it", () => {
    expect(questionsLeftOut([unusable({ questions: ["Kept", 7, null, "  "] })])[0].questions).toEqual([
      "Kept",
    ]);
  });

  it("still lists the questions when the server sent no sentence, and writes none of its own", () => {
    expect(questionsLeftOut([unusable({ message: undefined })])).toEqual([
      { message: null, questions: ["Why do you think metals feel cold?", "a question that was not structured"] },
    ]);
  });
});

describe("the notice", () => {
  it("says the server's sentence and lists the questions under it", () => {
    render(<QuestionsLeftOut notes={[unusable()]} />);

    expect(screen.getByText(SERVER_SENTENCE)).toBeInTheDocument();
    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Why do you think metals feel cold?",
      "a question that was not structured",
    ]);
  });

  it("draws one line per note", () => {
    render(
      <QuestionsLeftOut
        notes={[
          unusable(),
          unusable({ message: "Second note.", questions: ["What would you do?"] }),
        ]}
      />,
    );

    expect(screen.getByText(SERVER_SENTENCE)).toBeInTheDocument();
    expect(screen.getByText("Second note.")).toBeInTheDocument();
    expect(screen.getAllByRole("list")).toHaveLength(2);
  });

  it("draws nothing when no question was left out", () => {
    const { container } = render(<QuestionsLeftOut notes={technical} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("never shows a technical note's message", () => {
    render(<QuestionsLeftOut notes={[...technical, unusable()]} />);

    expect(screen.queryByText(/deterministic parsing/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Audio could not be generated/)).not.toBeInTheDocument();
  });
});
