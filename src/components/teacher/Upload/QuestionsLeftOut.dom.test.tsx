import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import {
  BACKUP_READER_LINE,
  QuestionsLeftOut,
  TEXT_HELD_BACK_LINE,
  picturesRefused,
  questionsLeftOut,
  readerNotes,
  textHeldBack,
} from "./QuestionsLeftOut";

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
  // As backend 06396db words it: only when a page gave up no text.
  const READER =
    "Nevo read this file with a reader that ignores layout and cannot read a scanned page, and some pages gave up no text at all. Columns, tables and anything handwritten may have come through jumbled or be missing. Check the sections against the original, and if the lesson looks thin, try uploading the text itself.";
  const reader = (over: Record<string, unknown> = {}) => ({
    code: "source_read_by_backup_reader",
    pageNumbers: [4, 5],
    message: READER,
    ...over,
  });
  // The note as backend 86f8e10 sends it: no `categories`, no `phase`.
  const blocked = {
    code: "visual_blocked_by_safety",
    segment: "k-2",
    message:
      "A safety check held back the picture for this section, so the section has no picture. Its teaching text is unchanged. If that looks wrong, tell us the lesson and this section and we will look at the check rather than your material.",
    secondsSpent: 4.2,
  };
  // As bdc6bed sent it, before 86f8e10 - which a stored upload can still carry.
  const older = { ...blocked, categories: ["violence"], phase: "image_prompt" };

  // Lydia, 10 Nov (item 3): her words, in place of the server's sentence.
  it("says Lydia's line, never the server's sentence", () => {
    expect(readerNotes([reader()])).toEqual([BACKUP_READER_LINE]);
    render(<QuestionsLeftOut notes={[reader()]} />);

    expect(screen.getByText(BACKUP_READER_LINE)).toBeInTheDocument();
    expect(screen.queryByText(READER)).not.toBeInTheDocument();
  });

  it("says it once, however many notes say so", () => {
    render(<QuestionsLeftOut notes={[reader(), reader({ pageNumbers: [9] })]} />);

    expect(screen.getAllByText(BACKUP_READER_LINE)).toHaveLength(1);
  });

  it("says it before the questions left out", () => {
    render(<QuestionsLeftOut notes={[unusable(), reader()]} />);

    const said = screen.getByText(BACKUP_READER_LINE);
    const left = screen.getByText(SERVER_SENTENCE);
    expect(said.compareDocumentPosition(left) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("says it even where the note came with no sentence: the words are Lydia's", () => {
    render(<QuestionsLeftOut notes={[reader({ message: "" })]} />);

    expect(screen.getByText(BACKUP_READER_LINE)).toBeInTheDocument();
  });

  // Hub, 11 Nov: not said until Lydia's words arrive - its sentence invites a
  // report there is nowhere to make (her 10 Nov rule).
  it("says nothing for a refused picture, for now", () => {
    const { container } = render(<QuestionsLeftOut notes={[blocked]} segmentName={() => "Segment 2"} />);

    expect(container).toBeEmptyDOMElement();
  });

  // Hub, 9 Nov, option (b): here until the lesson review can read it. With the
  // switch on, as it will be once Lydia's words arrive.
  it("says a refused picture's own sentence under its segment's name - and never which rule fired or when", () => {
    const { container } = render(
      <QuestionsLeftOut
        notes={[older, reader()]}
        segmentName={(key) => (key === "k-2" ? "Segment 2" : null)}
        refusedPictures
      />,
    );

    expect(screen.getByText(blocked.message)).toBeInTheDocument();
    expect(screen.getByText("Segment 2")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/violence|image_prompt|4\.2/);
  });

  it("still says it, under no name, where the screen has no such segment", () => {
    const { container } = render(<QuestionsLeftOut notes={[blocked]} segmentName={() => null} refusedPictures />);

    expect(screen.getByText(blocked.message)).toBeInTheDocument();
    expect(container.querySelectorAll("span")).toHaveLength(0);
  });

  it("reads only the segment and the sentence, once each", () => {
    expect(picturesRefused([blocked, blocked, { ...blocked, message: "" }, { ...blocked, segment: null }])).toEqual([
      { segment: "k-2", message: blocked.message },
    ]);
  });
});

/**
 * A PART OF THE LESSON NEVO WROTE, HELD BACK BY A SAFETY CHECK (backend
 * 06396db). That part came through as plain text with no questions - Food
 * Chains, 9 Nov - and nothing said why. Lydia's line (10 Nov, item 1), with the
 * part's pages beside it where the server sent them (item 2). Never the
 * server's "Tell us the lesson name…": nothing invites a report until there is
 * somewhere to send one.
 */
describe("a part of the lesson held back", () => {
  const SERVER =
    "A safety check held back the lesson Nevo wrote from this part of your file, so this part came through as plain text with no questions. Your file was not the problem - it passed its own check. Tell us the lesson name and we will look at the check.";
  const held = (over: Record<string, unknown> = {}) => ({
    code: "lesson_text_blocked_by_safety",
    textRetained: true,
    chunkNumber: 2,
    pageNumbers: [3, 4],
    message: SERVER,
    ...over,
  });

  it("says Lydia's line with the part's pages beside it, and never the server's invitation", () => {
    expect(textHeldBack([held()])).toEqual([{ pages: "Pages 3 and 4" }]);
    render(<QuestionsLeftOut notes={[held()]} />);

    expect(screen.getByText(TEXT_HELD_BACK_LINE)).toBeInTheDocument();
    expect(screen.getByText("Pages 3 and 4")).toBeInTheDocument();
    expect(screen.queryByText(SERVER)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tell us/)).not.toBeInTheDocument();
  });

  it("names one page as a page, and a run of pages as a range", () => {
    expect(textHeldBack([held({ pageNumbers: [7] })])).toEqual([{ pages: "Page 7" }]);
    expect(textHeldBack([held({ pageNumbers: [1, 2, 3, 4] })])).toEqual([{ pages: "Pages 1 to 4" }]);
  });

  it("says no pages where the note has none", () => {
    const { container } = render(<QuestionsLeftOut notes={[held({ pageNumbers: [] })]} />);

    expect(screen.getByText(TEXT_HELD_BACK_LINE)).toBeInTheDocument();
    expect(container.querySelectorAll("span")).toHaveLength(0);
  });

  it("says each part under its own pages, and the same pages once", () => {
    render(
      <QuestionsLeftOut
        notes={[
          held({ chunkNumber: 1, pageNumbers: [3, 4] }),
          held({ chunkNumber: 3, pageNumbers: [9] }),
          held({ chunkNumber: 4, pageNumbers: [3, 4] }),
        ]}
      />,
    );

    expect(screen.getAllByText(TEXT_HELD_BACK_LINE)).toHaveLength(2);
    expect(screen.getByText("Pages 3 and 4")).toBeInTheDocument();
    expect(screen.getByText("Page 9")).toBeInTheDocument();
  });

  it("says it before how the file was read and before the questions left out", () => {
    render(
      <QuestionsLeftOut
        notes={[unusable(), { code: "source_read_by_backup_reader", message: "Read with the other reader." }, held()]}
      />,
    );

    const first = screen.getByText(TEXT_HELD_BACK_LINE);
    expect(first.compareDocumentPosition(screen.getByText(BACKUP_READER_LINE)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(first.compareDocumentPosition(screen.getByText(SERVER_SENTENCE)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("says it even where the note came with no sentence: the words are Lydia's", () => {
    render(<QuestionsLeftOut notes={[held({ message: " " })]} />);

    expect(screen.getByText(TEXT_HELD_BACK_LINE)).toBeInTheDocument();
  });
});
