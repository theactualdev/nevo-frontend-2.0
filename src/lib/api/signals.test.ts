import { beforeEach, describe, expect, it, vi } from "vitest";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("./client", () => ({ api: { post, get: vi.fn(), patch: vi.fn() } }));

import { signalsApi } from "./signals";
import { SIGNAL_EVENT_TYPES } from "@/lib/constants";

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

describe("what still does not leave the device", () => {
  it("holds back the one type the enum has no value for", async () => {
    /*
     * `module_boundary_action` is the sibling of `module_boundary_reached` and
     * the only genuine gap left. One unknown type rejects the WHOLE batch with
     * a 422, so sending it would lose every signal beside it.
     */
    await signalsApi.submitBatch(SESSION, [
      event(SIGNAL_EVENT_TYPES.MODULE_BOUNDARY_REACHED),
      event(SIGNAL_EVENT_TYPES.MODULE_BOUNDARY_ACTION),
    ]);

    expect(sentTypes()).toEqual(["module_boundary_reached"]);
  });

  it("holds back the interface's own instrumentation", async () => {
    // These describe the console's state rather than anything a child did.
    await signalsApi.submitBatch(SESSION, [
      event(SIGNAL_EVENT_TYPES.SYSTEM_BUSY),
      event(SIGNAL_EVENT_TYPES.TAP_BLOCKED),
    ]);

    expect(post).not.toHaveBeenCalled();
  });

  it("makes no request at all when nothing in the batch can be sent", async () => {
    const out = await signalsApi.submitBatch(SESSION, [
      event(SIGNAL_EVENT_TYPES.MODULE_BOUNDARY_ACTION),
    ]);

    expect(post).not.toHaveBeenCalled();
    expect(out).toBeNull();
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
