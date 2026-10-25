import { beforeEach, describe, expect, it, vi } from "vitest";

const { post, ApiError } = vi.hoisted(() => {
  class ApiError extends Error {
    constructor(
      public readonly status: number,
      message: string,
      public readonly detail?: unknown,
    ) {
      super(message);
    }
  }
  return { post: vi.fn(), ApiError };
});
vi.mock("./client", () => ({ api: { post }, ApiError }));

import { signalsApi } from "./signals";
import { SIGNAL_EVENT_TYPES } from "@/lib/constants";

/**
 * ONE REFUSED EVENT COST EVERY EVENT BESIDE IT.
 *
 * 23 Oct's sweep, 13:14:07 UTC: a batch came back 422 because its second
 * event, `modality_switch_outcome`, carried no scores - the server requires
 * them when there is no `outcome`, and rule 3 keeps this client from working
 * them out. A refused batch is dropped, so the section's `time_on_segment`
 * went with it, on every format switch. The 422 names the event it refused;
 * the rest go again without it.
 */

const SESSION = {
  sessionId: "11111111-1111-4111-8111-111111111111",
  lessonId: "lesson-1",
  startedAt: "2026-10-23T13:00:00.000Z",
};

const event = (type: string) => ({
  type: type as never,
  timestamp: "2026-10-23T13:14:07.000Z",
});

/** The 422 as the deployed backend wrote it on the sweep. */
const refused = (...places: unknown[][]) =>
  new ApiError(422, "invalid", {
    detail: {
      code: "validation_error",
      message: "Request validation failed.",
      errors: places.map((location) => ({
        type: "value_error",
        location,
        message:
          "Value error, Ask Nevo signal missing required field(s): comprehensionScore, engagementScore, modality.",
      })),
    },
  });

const sentTypes = (call: number) =>
  (post.mock.calls[call][1] as { events: { eventType: string }[] }).events.map(
    (e) => e.eventType,
  );

const BATCH = [
  event(SIGNAL_EVENT_TYPES.TIME_ON_SEGMENT),
  event(SIGNAL_EVENT_TYPES.MODALITY_SWITCH_OUTCOME),
  event(SIGNAL_EVENT_TYPES.REPLAY),
];

beforeEach(() => {
  post.mockReset();
});

describe("a batch the server refuses one event of", () => {
  it("sends the rest again without the event it named", async () => {
    post
      .mockRejectedValueOnce(refused(["body", "events", 1]))
      .mockResolvedValueOnce({ sessionId: SESSION.sessionId, acceptedEvents: 2 });

    const receipt = await signalsApi.submitBatch(SESSION, BATCH);

    expect(post).toHaveBeenCalledTimes(2);
    expect(sentTypes(0)).toEqual([
      SIGNAL_EVENT_TYPES.TIME_ON_SEGMENT,
      SIGNAL_EVENT_TYPES.MODALITY_SWITCH_OUTCOME,
      SIGNAL_EVENT_TYPES.REPLAY,
    ]);
    expect(sentTypes(1)).toEqual([
      SIGNAL_EVENT_TYPES.TIME_ON_SEGMENT,
      SIGNAL_EVENT_TYPES.REPLAY,
    ]);
    expect(receipt?.acceptedEvents).toBe(2);
  });

  it("leaves out every event it named", async () => {
    post
      .mockRejectedValueOnce(refused(["body", "events", 0], ["body", "events", 2]))
      .mockResolvedValueOnce({ sessionId: SESSION.sessionId, acceptedEvents: 1 });

    await signalsApi.submitBatch(SESSION, BATCH);

    expect(sentTypes(1)).toEqual([SIGNAL_EVENT_TYPES.MODALITY_SWITCH_OUTCOME]);
  });

  it("tries once more, never again", async () => {
    const second = refused(["body", "events", 0]);
    post
      .mockRejectedValueOnce(refused(["body", "events", 1]))
      .mockRejectedValueOnce(second);

    await expect(signalsApi.submitBatch(SESSION, BATCH)).rejects.toBe(second);
    expect(post).toHaveBeenCalledTimes(2);
  });
});

describe("a refusal that is not about some of the events", () => {
  it.each([
    ["every event named", refused(["body", "events", 0], ["body", "events", 1], ["body", "events", 2])],
    ["the session named, not an event", refused(["body", "session", "sessionId"])],
    ["a 422 with no errors list", new ApiError(422, "invalid", { detail: { code: "x" } })],
    ["a server error", new ApiError(500, "down")],
    ["the network", new ApiError(0, "offline")],
  ])("is the refusal it was: %s", async (_, cause) => {
    post.mockRejectedValueOnce(cause);

    await expect(signalsApi.submitBatch(SESSION, BATCH)).rejects.toBe(cause);
    expect(post).toHaveBeenCalledTimes(1);
  });
});
