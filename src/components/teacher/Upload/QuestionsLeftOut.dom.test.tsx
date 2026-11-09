import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QuestionsLeftOut, picturesRefused, questionsLeftOut, readerNotes } from "./QuestionsLeftOut";

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

  it("still keeps the questions when the server sent no sentence", () => {
    expect(questionsLeftOut([unusable({ message: undefined })])).toEqual([
      { message: null, questions: ["Why do you think metals feel cold?", "a question that was not structured"] },
    ]);
  });
});

// Lydia, 9 Nov (item 21): a list never appears with nothing above it.
describe("a note that came with no sentence", () => {
  it("is listed under Lydia's line, which claims nothing about why", () => {
    render(<QuestionsLeftOut notes={[unusable({ message: undefined })]} />);

    expect(screen.getByText("These questions were left out of the lesson.")).toBeInTheDocument();
    expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(2);
  });

  it("never stands in for the server's own sentence", () => {
    render(<QuestionsLeftOut notes={[unusable()]} />);

    expect(screen.getByText(SERVER_SENTENCE)).toBeInTheDocument();
    expect(screen.queryByText("These questions were left out of the lesson.")).not.toBeInTheDocument();
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

/**
 * Backend bdc6bed (9 Nov): two new teacher-facing notes. This component says
 * the upload-level one, `source_read_by_backup_reader`, in its `message` alone.
 * The per-segment `visual_blocked_by_safety` belongs on that segment's picture
 * in the review, never here, and nothing of it but its message is ever for a
 * teacher (Lydia, item 6: never which rule fired or what triggered it).
 */
describe("how the file was read", () => {
  const READER =
    "The console could not read this file, so Nevo read it with a plainer reader that ignores layout and cannot read a scanned page. Columns, tables and anything handwritten may have come through jumbled or not at all. Check the sections against the original, and if the lesson looks thin, try uploading the text itself.";
  const reader = (over: Record<string, unknown> = {}) => ({ code: "source_read_by_backup_reader", message: READER, ...over });
  const blocked = {
    code: "visual_blocked_by_safety",
    segment: "k-2",
    categories: ["violence"],
    phase: "image_prompt",
    message: "The safety check refused the picture for this section, so the section has no picture.",
    secondsSpent: 4.2,
  };

  it("says the backup reader's own sentence, word for word", () => {
    expect(readerNotes([reader()])).toEqual([READER]);
    render(<QuestionsLeftOut notes={[reader()]} />);

    expect(screen.getByText(READER)).toBeInTheDocument();
  });

  it("says it before the questions left out", () => {
    render(<QuestionsLeftOut notes={[unusable(), reader()]} />);

    const said = screen.getByText(READER);
    const left = screen.getByText(SERVER_SENTENCE);
    expect(said.compareDocumentPosition(left) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("says nothing for a reader note that came with no sentence", () => {
    const { container } = render(<QuestionsLeftOut notes={[reader({ message: "" })]} />);

    expect(container).toBeEmptyDOMElement();
  });

  // Hub, 9 Nov, option (b): here until the lesson review can read it.
  it("says a refused picture's own sentence under its segment's name - and never which rule fired or when", () => {
    const { container } = render(
      <QuestionsLeftOut
        notes={[blocked, reader()]}
        segmentName={(key) => (key === "k-2" ? "Segment 2" : null)}
      />,
    );

    expect(screen.getByText(blocked.message)).toBeInTheDocument();
    expect(screen.getByText("Segment 2")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/violence|image_prompt|4\.2/);
  });

  it("still says it, under no name, where the screen has no such segment", () => {
    const { container } = render(<QuestionsLeftOut notes={[blocked]} segmentName={() => null} />);

    expect(screen.getByText(blocked.message)).toBeInTheDocument();
    expect(container.querySelectorAll("span")).toHaveLength(0);
  });

  it("reads only the segment and the sentence, once each", () => {
    expect(picturesRefused([blocked, blocked, { ...blocked, message: "" }, { ...blocked, segment: null }])).toEqual([
      { segment: "k-2", message: blocked.message },
    ]);
  });
});
