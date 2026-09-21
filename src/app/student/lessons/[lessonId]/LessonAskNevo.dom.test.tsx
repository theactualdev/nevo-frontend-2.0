import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useContext, useEffect } from "react";
import { LessonAskNevo } from "./LessonAskNevo";
import { LessonContext, LessonProvider } from "@/context/LessonContext";
import LessonLayout from "./layout";

/**
 * EVERY QUESTION ASKED FROM INSIDE A LESSON ARRIVED WITHOUT THE LESSON.
 *
 * `AskNevo` has always read `useContext(LessonContext)?.lessonId` and always
 * sent it in `contextIds`. It resolved to null every time, because the
 * component was rendered from `StudentShell` as a SIBLING of `{children}` -
 * and the `LessonProvider` that supplies the id lives in the lesson route's
 * own layout, inside `children`.
 *
 * So this was never missing wiring. It was provider placement, and the fix is
 * a move: Ask Nevo now renders inside the layout that provides the context.
 *
 * `/review` and `/summary` sit under the same layout and are not the player,
 * so the shell's own route test is shared rather than copied.
 */

const pathname = vi.hoisted(() => ({ value: "/student/lessons/les-1" }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

const ask = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    askNevoApi: { ask: (...a: unknown[]) => ask(...a) },
  };
});

vi.mock("@/hooks", () => ({ useAuth: () => ({ user: { id: "stu-1" } }) }));

/**
 * Stands in for the player, which is what publishes the active lesson.
 *
 * Depends on `setActiveLesson` ALONE, never on the context object: the value
 * is re-memoised whenever the active lesson changes, so depending on `ctx`
 * makes this effect publish, re-render, and publish again forever. The setter
 * is stable by construction.
 */
function PlayerStub({ lessonId }: { lessonId: string }) {
  const setActiveLesson = useContext(LessonContext)?.setActiveLesson;
  useEffect(() => {
    setActiveLesson?.({
      lessonId,
      sessionId: "11111111-2222-3333-4444-555555555555",
      adaptationPlan: null,
    });
  }, [setActiveLesson, lessonId]);
  return null;
}

const LESSON_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

const mountInsideProvider = () =>
  render(
    <LessonProvider>
      <PlayerStub lessonId={LESSON_ID} />
      <LessonAskNevo />
    </LessonProvider>,
  );

/** What the shell used to do: Ask Nevo OUTSIDE the lesson's provider. */
const mountOutsideProvider = () =>
  render(
    <>
      <LessonProvider>
        <PlayerStub lessonId={LESSON_ID} />
      </LessonProvider>
      <LessonAskNevo />
    </>,
  );

/*
 * TWO LAUNCHERS EXIST AT ONCE: a docked circle for mobile and a corner pill for
 * desktop, shown by media query. jsdom applies no media queries, so both are in
 * the tree and a single `findByRole` matches two elements. The first is enough
 * - this file is about which provider the component sits under, not which
 * affordance a viewport gets.
 */
const launchers = () => screen.queryAllByRole("button", { name: /ask nevo/i });

const askSomething = async () => {
  await waitFor(() => expect(launchers().length).toBeGreaterThan(0));
  fireEvent.click(launchers()[0]);
  const box = await screen.findByRole("textbox");
  fireEvent.change(box, { target: { value: "What is a numerator?" } });
  fireEvent.keyDown(box, { key: "Enter" });
  await waitFor(() => expect(ask).toHaveBeenCalled());
  return ask.mock.calls.at(-1)?.[0] as {
    contextIds: { lessonId: string | null };
  };
};

/*
 * jsdom implements no scrolling, and the panel scrolls its thread to the newest
 * message on open. Without this the component throws before it ever gets to
 * send the question this file is about.
 */
beforeAll(() => {
  Element.prototype.scrollTo = () => {};
});

beforeEach(() => {
  pathname.value = "/student/lessons/les-1";
  ask.mockReset().mockResolvedValue({ answer: "…", threadId: null });
});

afterEach(() => {
  cleanup();
});

describe("a question asked from inside a lesson", () => {
  it("carries the lesson it was asked in", async () => {
    mountInsideProvider();

    const sent = await askSomething();

    expect(sent.contextIds.lessonId).toBe(LESSON_ID);
  });

  it("carried nothing when it rendered outside the provider", async () => {
    /*
     * The shipped behaviour, kept as a test so the move cannot be undone
     * silently. Rendering as a sibling of the provider is indistinguishable
     * from having no lesson open.
     */
    mountOutsideProvider();

    const sent = await askSomething();

    expect(sent.contextIds.lessonId).toBeNull();
  });
});

describe("where Ask Nevo belongs", () => {
  it("is present on the player", () => {
    pathname.value = "/student/lessons/les-1";
    mountInsideProvider();

    expect(launchers().length).toBeGreaterThan(0);
  });

  it("is present on the review session, which reuses the player", () => {
    pathname.value = "/student/lessons/les-1/review-session";
    mountInsideProvider();

    expect(launchers().length).toBeGreaterThan(0);
  });

  it("is absent on the summary, which sits under the same layout", () => {
    // `/summary` and `/review` share this route segment and are not the
    // player - they have their own chrome, and Ask Nevo does not belong there.
    pathname.value = "/student/lessons/les-1/summary";
    mountInsideProvider();

    expect(launchers()).toEqual([]);
  });

  it("is absent on the after-lesson review", () => {
    pathname.value = "/student/lessons/les-1/review";
    mountInsideProvider();

    expect(launchers()).toEqual([]);
  });
});

describe("the layout is what puts it in the right place", () => {
  /**
   * The tests above prove the COMPONENT behaves correctly given its placement.
   * This one pins the placement itself - without it, moving `LessonAskNevo`
   * back out of the layout passes every other test in this file, which is the
   * exact regression the whole change exists to prevent.
   */
  it("renders Ask Nevo inside the lesson's provider", async () => {
    render(<LessonLayout>{<PlayerStub lessonId={LESSON_ID} />}</LessonLayout>);

    const sent = await askSomething();

    expect(sent.contextIds.lessonId).toBe(LESSON_ID);
  });
});
