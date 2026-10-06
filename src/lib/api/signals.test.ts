import { beforeEach, describe, expect, it, vi } from "vitest";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("./client", () => ({ api: { post, get: vi.fn(), patch: vi.fn() } }));

import { signalsApi } from "./signals";
import { ONBOARDING_SIGNAL_TYPES, SIGNAL_EVENT_TYPES } from "@/lib/constants";

/**
 * Which signals actually leave the device.
 *
 * **NINE TYPES WERE BEING THROWN AWAY AT OUR OWN DOOR.** The filter was an
 * allow-list naming every value the backend accepted - a hand-maintained second
 * copy of `SignalEventType` - and the enum grew from 22 to 31 without it. So
 * `break_start`, `break_end`, `feeling_checkin` and `module_boundary_reached`
 * were asked for by us, built by backend, emitted by this client, and dropped
 * here. Nothing failed; the batch simply left without them.
 *
 * The list is inverted now, so these tests are about the property that matters:
 * a type backend accepts gets through WITHOUT anyone remembering to add it.
 */

const SESSION = {
  sessionId: "11111111-1111-4111-8111-111111111111",
  lessonId: "lesson-1",
  startedAt: "2026-09-24T09:00:00.000Z",
};

const event = (type: string) => ({
  type: type as never,
  timestamp: "2026-09-24T09:00:01.000Z",
});

const sentTypes = () =>
  (post.mock.calls[0][1] as { events: { eventType: string }[] }).events.map(
    (e) => e.eventType,
  );

beforeEach(() => {
  post.mockReset();
  post.mockResolvedValue({ sessionId: SESSION.sessionId, acceptedEvents: 1 });
});

describe("the four we asked for and were dropping", () => {
  it.each([
    [SIGNAL_EVENT_TYPES.BREAK_START],
    [SIGNAL_EVENT_TYPES.BREAK_END],
    [SIGNAL_EVENT_TYPES.FEELING_CHECKIN],
    [SIGNAL_EVENT_TYPES.MODULE_BOUNDARY_REACHED],
    ],
  )("sends %s", async (type) => {
    await signalsApi.submitBatch(SESSION, [event(type)]);

    expect(sentTypes()).toEqual([type]);
  });

  it("sends the consolidation break's answer, which was the point of asking", async () => {
    // "The consolidation break asks a child how they feel and the answer is
    // discarded" was the ask. It landed, and we kept discarding it.
    await signalsApi.submitBatch(SESSION, [
      event(SIGNAL_EVENT_TYPES.BREAK_START),
      event(SIGNAL_EVENT_TYPES.FEELING_CHECKIN),
      event(SIGNAL_EVENT_TYPES.BREAK_END),
    ]);

    expect(sentTypes()).toHaveLength(3);
  });
});

describe("what used to stay on the device", () => {
  it("sends what a child did at a module boundary, now that it can", async () => {
    /*
     * `module_boundary_action` was the one genuine gap in this list - a signal
     * we collected on device and dropped at the door, because the enum had no
     * value for it. Backend added it on 24 Sep, so both halves of a boundary
     * now travel: that a child reached one, and what they chose there.
     */
    await signalsApi.submitBatch(SESSION, [
      event(SIGNAL_EVENT_TYPES.MODULE_BOUNDARY_REACHED),
      event(SIGNAL_EVENT_TYPES.MODULE_BOUNDARY_ACTION),
    ]);

    expect(sentTypes()).toEqual([
      "module_boundary_reached",
      "module_boundary_action",
    ]);
  });

  it("makes no request for a batch with nothing in it", async () => {
    // `events` is `minItems: 1`; an empty post would be a 422.
    const out = await signalsApi.submitBatch(SESSION, []);

    expect(post).not.toHaveBeenCalled();
    expect(out).toBeNull();
  });
});

/*
 * THE SIX THAT WERE OURS ALONE ARE THE CONTRACT'S NOW (backend B13, 1 Oct).
 * They were dropped at our door, so the engine never learned when the system
 * owned a wait, read every one as the child hesitating, and had no form factor
 * or motion mode to read a session's timings under.
 */
describe("what leaves the device since 1 Oct", () => {
  it.each([
    [SIGNAL_EVENT_TYPES.SYSTEM_BUSY],
    [SIGNAL_EVENT_TYPES.TAP_BLOCKED],
    [SIGNAL_EVENT_TYPES.SESSION_CONTEXT],
    [ONBOARDING_SIGNAL_TYPES.BASELINE_MODULE_START],
    [ONBOARDING_SIGNAL_TYPES.BASELINE_MODULE_COMPLETE],
    [ONBOARDING_SIGNAL_TYPES.BASELINE_SUBMITTED],
  ])("sends %s", async (type) => {
    await signalsApi.submitBatch(SESSION, [event(type)]);

    expect(sentTypes()).toEqual([type]);
  });

  it("sends the session context with exactly the contract's two keys", async () => {
    await signalsApi.submitBatch(SESSION, [
      {
        ...event(SIGNAL_EVENT_TYPES.SESSION_CONTEXT),
        payload: { formFactor: "tablet", reducedMotion: true },
      },
    ]);

    const [sent] = (
      post.mock.calls[0][1] as { events: { eventData: unknown }[] }
    ).events;
    expect(sent.eventData).toEqual({ formFactor: "tablet", reducedMotion: true });
  });

  it("labels an Ask Nevo stream as one", async () => {
    await signalsApi.submitBatch(
      { ...SESSION, lessonId: null, sessionType: "ask_nevo" },
      [event(SIGNAL_EVENT_TYPES.ASK_NEVO_QUESTION_STUDENT)],
    );

    const { session } = post.mock.calls[0][1] as {
      session: Record<string, unknown>;
    };
    expect(session.sessionType).toBe("ask_nevo");
    expect(session.lessonId).toBeNull();
  });
});

/*
 * NOTHING IS FILTERED NOW, SO A TYPE THE ENUM DOES NOT HOLD 422s THE WHOLE
 * BATCH - every event in it, not just its own. This pins every type the client
 * can emit against `SignalEventType` as deployed on 1 Oct, so a type added here
 * that backend has not got fails a test rather than a child's lesson.
 */
const DEPLOYED_1_OCT = new Set([
  "time_on_segment", "replay", "scroll", "simplify_trigger", "expand_trigger",
  "slower_trigger", "comprehension_response", "exit_attempt", "break_suggested",
  "break_taken", "break_start", "break_end", "feeling_checkin",
  "module_boundary_reached", "module_boundary_action", "engagement_signal",
  "modality_suggestion_shown", "modality_suggestion_accepted",
  "modality_suggestion_declined", "modality_suggestion_ignored",
  "modality_switch_outcome", "modality_manual_switch",
  "calculation_step_response", "calculation_complete", "narration_played",
  "narration_replayed", "manipulative_piece_placed",
  "ask_nevo_question_student", "ask_nevo_question_teacher",
  "ask_nevo_cannot_help", "ask_nevo_redirect_used", "adaptation_suppressed",
  "media_load_failed", "system_busy", "tap_blocked", "session_context",
  "baseline_module_start", "baseline_module_complete", "baseline_submitted",
  "hint_offered", "hint_used", "step_up_offered", "step_up_accepted",
  "step_up_declined", "guided_question_shown", "guided_question_answered",
]);

describe("every type the client can emit", () => {
  it("is one the deployed ingest enum accepts", () => {
    const ours = [
      ...Object.values(SIGNAL_EVENT_TYPES),
      ...Object.values(ONBOARDING_SIGNAL_TYPES),
    ];

    expect(ours.filter((t) => !DEPLOYED_1_OCT.has(t))).toEqual([]);
  });
});

describe("the property the inversion buys", () => {
  it("lets a type through that nobody added to a list here", async () => {
    /*
     * THE WHOLE POINT. Under the allow-list, a value backend added was dropped
     * until somebody remembered to copy it across - and for nine types nobody
     * did. Anything not explicitly ours now travels.
     */
    await signalsApi.submitBatch(SESSION, [
      event("a_type_invented_after_this_test_was_written"),
    ]);

    expect(sentTypes()).toEqual(["a_type_invented_after_this_test_was_written"]);
  });
});

describe("how the session ended", () => {
  it("travels on the envelope once there is something to say", async () => {
    await signalsApi.submitBatch(
      {
        ...SESSION,
        completionStatus: "exited",
        endedAt: "2026-09-24T09:10:00.000Z",
        exitPosition: "s".repeat(200),
        breakCount: 2,
      },
      [event(SIGNAL_EVENT_TYPES.TIME_ON_SEGMENT)],
    );

    const { session } = post.mock.calls[0][1] as {
      session: Record<string, unknown>;
    };
    expect(session.completionStatus).toBe("exited");
    expect(session.breakCount).toBe(2);
    // `maxLength: 120` - a longer one would 422 the whole batch.
    expect(String(session.exitPosition)).toHaveLength(120);
  });

  it("is left to the contract's defaults while the session is going", async () => {
    await signalsApi.submitBatch(SESSION, [
      event(SIGNAL_EVENT_TYPES.TIME_ON_SEGMENT),
    ]);

    const { session } = post.mock.calls[0][1] as {
      session: Record<string, unknown>;
    };
    expect(session).not.toHaveProperty("completionStatus");
    expect(session).not.toHaveProperty("endedAt");
  });

  it("asks for a request that outlives the page when told to", async () => {
    await signalsApi.submitBatch(
      SESSION,
      [event(SIGNAL_EVENT_TYPES.TIME_ON_SEGMENT)],
      { keepalive: true },
    );

    expect(post.mock.calls[0][2]).toEqual({ keepalive: true });
  });
});

describe("types the server writes itself (B37)", () => {
  it("never sends them, even if one reaches the batch", async () => {
    // Sending either doubles a count the server already keeps.
    await signalsApi.submitBatch(SESSION, [
      event("adaptation_suppressed"),
      event("guided_question_answered"),
      event("time_on_segment"),
    ]);

    expect(sentTypes()).toEqual(["time_on_segment"]);
  });

  it("makes no request at all when nothing else is in the batch", async () => {
    const receipt = await signalsApi.submitBatch(SESSION, [
      event("adaptation_suppressed"),
    ]);

    expect(receipt).toBeNull();
  });
});
