import { api } from "./client";
import type { ComprehensionCheckpoint } from "./checkpoints";
import type {
  AudioVariant,
  CalculationVariant,
  InteractiveVariant,
  TextVariant,
  VisualVariant,
} from "./variants";

/**
 * Lesson content endpoints.
 *
 * `upload` is the one the console wants: multipart, with extraction done
 * server-side, so PDF, Word, PowerPoint, Markdown and plain text all work
 * without the browser trying to read them. It replaces the pdfjs extraction
 * the wizard used to do, which could never cover Word or PowerPoint.
 *
 * `parse` remains for callers that already hold extracted text.
 *
 * THESE ARE ASYNCHRONOUS NOW (backend, 9 Sep). `parse`, `upload` and
 * `regenerate` all answer **202** with a receipt - `lessonId`, `parseRunId`,
 * `status` and a `pollUrl` - and the work carries on without you. The finished
 * lesson is NOT in that response: poll `parseRun` until `finished`, then read
 * the lesson.
 *
 * The old shape - `ParseContentResponse`, the whole parsed lesson returned
 * synchronously - is gone from the deployed spec entirely. It was never really
 * synchronous: the contract declared only 200/422 while `ContentParseStatus`
 * admitted `pending` and `processing`, and the `parseRunId` it handed back was
 * accepted by no operation anywhere in 190. Asking about that contradiction is
 * what turned up three stacked backend faults.
 *
 * All three still CREATE the lesson: `lessonId` names a lesson that exists from
 * the moment the receipt arrives, even though it is not parsed yet.
 */

export type LessonSourceType =
  "pdf" | "word" | "powerpoint" | "google_drive" | "onedrive" | "text";

export type ContentParseStatus =
  "pending" | "processing" | "completed" | "completed_with_review" | "failed";

export type LessonContentType =
  | "explanatory_text"
  | "visual_diagram"
  | "worked_example"
  | "practice_question"
  | "definition"
  | "summary"
  | "calculation";

export type ContentModality = "visual" | "audio" | "text" | "interactive";

export interface SourcePage {
  pageNumber: number;
  text: string;
}

export interface ParseContentRequest {
  title: string;
  sourceType: LessonSourceType;
  sourceText?: string | null;
  pages?: SourcePage[];
  sourceMetadata?: Record<string, unknown>;
}

export interface ParsedLessonSegment {
  id: string;
  contentType: LessonContentType;
  sequenceOrder: number;
  title: string | null;
  body: string;
  availableModalities: ContentModality[];
  comprehensionCheckpoints: ComprehensionCheckpoint[];
  /**
   * Typed as of 3 Sep - see `api/variants.ts`. `interactiveVariant.answerKey`
   * is nullable exactly as a checkpoint's is, and `markInteractive` is the
   * only thing that should judge it.
   */
  textVariant: TextVariant | null;
  visualVariant: VisualVariant | null;
  audioVariant: AudioVariant | null;
  interactiveVariant: InteractiveVariant | null;
  calculationVariant: CalculationVariant | null;
  needsReview: boolean;
  reviewReasons: string[];
}

/**
 * 202 of `parse`, `upload` and `regenerate` - a receipt, not a result.
 *
 * `status` is the run's state at the moment it was accepted (`pending` or
 * `processing`), never its outcome.
 */
export interface ParseAccepted {
  lessonId: string;
  parseRunId: string;
  status: ContentParseStatus;
  /** Where to poll. The same route `parseRun(parseRunId)` builds. */
  pollUrl: string;
}

/**
 * 200 of `GET /api/content/parse-runs/{parse_run_id}` - how a run is going.
 *
 * POLL `finished`, NOT `status`. It is true for `completed`,
 * `completed_with_review` and `failed` alike, so a caller never has to
 * enumerate the terminal statuses - and so cannot hang forever by missing one.
 * `failureReason` SAYS WHY, AND ONLY SINCE 24 SEP DOES IT MEAN THAT.
 *
 * This route was serving `error_message` under this name - a field whose name
 * promises prose, handing over the first line of a stack trace. It is now the
 * same closed list of recognised causes the staged route uses, from one shared
 * place, so a lesson failing the same way on both routes cannot say two
 * different things. `error` is the new field that carries the raw text, because
 * the honest name for it was already taken.
 *
 * `fallbackSegmentCount` IS THE FIELD THAT MATTERS. A segment counted there is
 * deterministic split-up source text, not generated content. Every lesson in
 * the library was 100% fallback until 9 Sep: the model's output ceiling was
 * 4,096 tokens, so it ran out of room mid-object, the JSON failed to parse, and
 * the pipeline quietly fell back to splitting the source - while the call log
 * recorded the provider as having succeeded. Nothing anywhere said the AI had
 * contributed nothing. When this equals `segmentCount` the lesson is split-up
 * source text and worth regenerating; on a healthy parse it is 0.
 */
export interface ParseRunStatus {
  parseRunId: string;
  lessonId: string;
  status: ContentParseStatus;
  /** True for completed, completed_with_review and failed alike. */
  finished: boolean;
  startedAt: string;
  completedAt: string | null;
  failureReason: string | null;
  /**
   * The raw text, for reporting rather than for reading. New field here as of
   * 24 Sep - see the note above on why `failureReason` could not keep it.
   */
  error?: string | null;
  /** Twelve hex characters, in the log beside the exception. */
  incidentId?: string | null;
  reviewNotes: Record<string, unknown>[];
  segmentCount: number;
  /** Segments that are split source text rather than generated content. */
  fallbackSegmentCount: number;
}

/** 200 of POST /api/content/media/url. */
export interface MediaUrl {
  storagePath: string;
  url: string;
  /** Null means the fresh URL does not expire. */
  expiresInSeconds: number | null;
}

export const contentApi = {
  /**
   * Mint a fresh URL for a stored media object.
   *
   * Generated narration and images live in private Supabase storage behind
   * URLs that AGE OUT - `audioVariant` and `visualVariant` both carry
   * `urlExpiresInSeconds`. An expired one is a dead player or a missing
   * image, so `mediaUrlExpired` in `api/variants.ts` decides when to call
   * this, and `storagePath` - not the stale URL - is what identifies the
   * object.
   */
  mediaUrl: (storagePath: string) =>
    api.post<MediaUrl>("/api/content/media/url", { storagePath }),

  /** Parse already-extracted text. 202. POST /api/content/parse */
  parse: (payload: ParseContentRequest) =>
    api.post<ParseAccepted>("/api/content/parse", payload),

  /**
   * Re-run the parse over a lesson's OWN stored segment text. 202.
   *
   * It does not need the original source document, so a directly-seeded lesson
   * regenerates fine. Worth stating, because "it must be waiting on an upload
   * that was never there" was one of our theories for why this never returned,
   * and it was wrong.
   */
  regenerate: (lessonId: string) =>
    api.post<ParseAccepted>(`/api/content/lessons/${lessonId}/regenerate`),

  /** How a run is going. GET /api/content/parse-runs/{parse_run_id} */
  parseRun: (parseRunId: string) =>
    api.get<ParseRunStatus>(`/api/content/parse-runs/${parseRunId}`),

  /**
   * Upload a source file and get the parsed lesson back.
   * POST /api/content/upload (multipart: `file`, and an optional `subject`).
   *
   * THE SUBJECT IS OPTIONAL AND WAS NEVER SENT. This wrapper took a file and
   * nothing else, and `useLessonLibrary` recorded the consequence as a fact
   * about the endpoint - "takes only a file, so no lesson this console creates
   * carries one" - which is why the library's subject filter was hidden from
   * live data. `Body_content_upload_content` has carried `subject` all along.
   *
   * Free text on the wire, deliberately not an enum here: the contract states
   * no vocabulary, and a four-value list invented client-side would be wrong
   * for the first school whose classes are Biology, Chemistry and Physics.
   *
   * An unreadable or unsupported file is a 400 with a functional message -
   * that is a real answer about the file, not a server fault.
   */
  upload: (file: File, subject?: string | null) => {
    const form = new FormData();
    form.append("file", file);
    if (subject) form.append("subject", subject);
    return api.post<ParseAccepted>("/api/content/upload", form);
  },
};

/**
 * How often to ask, and how long before we stop asking.
 *
 * THE FIVE-MINUTE CEILING IS GONE (18 Sep), and it cost a teacher a lesson
 * that had finished. Backend's report on run `de43cb1c`: polling stopped at
 * 18:24:09.8, the run completed at 18:24:09.3 with ten segments - the last
 * poll went out half a second before it finished, came back `processing`,
 * and the screen reported a failure for a lesson that was sitting in the
 * library.
 *
 * The premise was wrong, not the number. This file said a run is "accepted
 * in about 2s and done in about 17s"; measured in production the text step
 * alone takes 115s, and every generated picture has a budget of up to 600s,
 * two at a time. A real parse is longer than five minutes by design.
 *
 * THE BACKEND OWNS THE DEADLINE. It marks a run failed itself after thirty
 * minutes (`STALE_RUN_AFTER`), so a client deadline can only ever be wrong
 * in one direction: shorter, and it invents a failure the server did not
 * report. The ceiling below is longer than theirs on purpose - it exists so
 * a page cannot poll a dead socket for ever, not to judge the work.
 */
const POLL_FAST_MS = 1500;
const POLL_SLOW_MS = 10_000;
/** Ask quickly while a short parse might still land, then settle down. */
const SLOW_AFTER_MS = 60_000;
/** Past the backend's own 30-minute stale marker, never inside it. */
const POLL_LIMIT_MS = 35 * 60 * 1000;
/**
 * One blip is not an answer.
 *
 * A single 502 from a cold-started proxy used to reject the whole wait, and
 * the parse carried on running server-side regardless - so the lesson landed
 * in the library while the teacher was told we could not reach Nevo. Three
 * consecutive failures is a real outage; one is traffic.
 */
const POLL_FAILURES_ALLOWED = 3;

/**
 * Wait for a parse run to finish, and hand back how it went.
 *
 * Resolves on `finished`, which includes `failed` - so a caller gets a REASON
 * rather than a timeout when the work genuinely could not be done. It rejects
 * only when the requests themselves keep failing, when the ceiling above is
 * reached, or when the caller aborted.
 *
 * A `processing` response is not a failure of any kind: it means Nevo was
 * reached and is working. Callers must not report it as a connection problem.
 */
export async function awaitParseRun(
  parseRunId: string,
  options: { signal?: AbortSignal } = {},
): Promise<ParseRunStatus> {
  const startedAt = Date.now();
  const until = startedAt + POLL_LIMIT_MS;
  let consecutiveFailures = 0;
  for (;;) {
    if (options.signal?.aborted) throw new Error("Parse run polling aborted.");
    try {
      const run = await contentApi.parseRun(parseRunId);
      consecutiveFailures = 0;
      if (run.finished) return run;
    } catch (error) {
      consecutiveFailures += 1;
      if (consecutiveFailures >= POLL_FAILURES_ALLOWED) throw error;
    }
    if (Date.now() >= until) {
      throw new Error(
        `Parse run ${parseRunId} had not finished after ${POLL_LIMIT_MS / 60000} minutes.`,
      );
    }
    const wait =
      Date.now() - startedAt < SLOW_AFTER_MS ? POLL_FAST_MS : POLL_SLOW_MS;
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}
