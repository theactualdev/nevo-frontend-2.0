import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { GIVES_WAY_AFTER_MS, RECOVERY_LINE } from "./QuickCheckSheet";
import { SIGNAL_EVENT_TYPES } from "@/lib/constants";
import type { Lesson } from "@/lib/types";

/**
 * THE QUICK CHECK, AS OLAYINKA CALLED IT ON 23 OCT - reversing IA 31's "No
 * manual dismiss". A child can tap out of it - the dimmed player, Esc, or the
 * phone sheet pulled down - back to the same section, the check unpassed;
 * Next asks it again. The move out is one `navigation_fragmentation`, as
 * Back's is (B105), and a scrim tap is no longer `tap_blocked`, because it
 * blocks nothing now.
 *
 * And a miss offers Try again alone (D93, confirmed 6 Oct): "See it
 * explained" went back to the segment and explained nothing.
 */

const { trackEvent } = vi.hoisted(() => ({ trackEvent: vi.fn() }));
vi.mock("@/hooks", () => ({
  useLesson: () => ({ setActiveLesson: vi.fn() }),
  useSignals: () => ({ trackEvent }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks/useLessonProgress", () => ({
  useLessonProgress: () => ({ sessionId: null, report: vi.fn() }),
}));
vi.mock("@/hooks/useRuntimeAdaptation", () => ({
  useRuntimeAdaptation: () => ({ offeredBreak: null, reason: null, plan: null }),
}));
vi.mock("@/context/AccessibilityContext", () => ({
  useAccessibility: () => ({ textSize: "regular", reducedMotion: false }),
  TEXT_ZOOM: { regular: 1 },
}));

const LESSON = {
  id: "photo-1",
  title: "Photosynthesis",
  segments: [
    {
      id: "seg-1",
      modalities: ["text"],
      text: { heading: "Inside a leaf", body: { default: "Leaves catch light." } },
      quickCheck: {
        question: "What do plants take in?",
        options: [
          { id: "co2", label: "Carbon dioxide" },
          { id: "o2", label: "Oxygen" },
        ],
        correctId: "co2",
        correctNote: "That's it.",
        recoveryNote: "Not quite. Let's look again.",
        // Reviewed: asked again on Next is a check that holds.
        holds: true,
      },
    },
    {
      id: "seg-2",
      modalities: ["text"],
      text: { heading: "Next", body: { default: "More." } },
    },
  ],
} as unknown as Lesson;

const openCheck = async () => {
  render(<LessonPlayer lesson={LESSON} plan={null} />);
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  // Radix arms its outside-tap listener on the next tick after opening; a tap
  // before then tests nothing.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
};
const check = () => screen.queryByRole("dialog");
const scrim = () =>
  document.querySelector<HTMLElement>('[data-slot="sheet-overlay"]')!;
const blocked = () =>
  trackEvent.mock.calls.filter((c) => c[0] === SIGNAL_EVENT_TYPES.TAP_BLOCKED);
const fragmentation = () =>
  trackEvent.mock.calls.filter(
    (c) =>
      c[0] === SIGNAL_EVENT_TYPES.ENGAGEMENT_SIGNAL &&
      (c[1] as { indicator?: string }).indicator === "navigation_fragmentation",
  );
const escape = () =>
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

beforeEach(() => {
  trackEvent.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("tapping out of the check (Olayinka, 23 Oct)", () => {
  // The scrim half is pinned in `QuickCheckSheet.dom.test.tsx`: Radix never
  // sees an outside tap in jsdom. Esc reaches the same close.
  it("closes on Esc, with the child still on the same section", async () => {
    await openCheck();

    escape();

    expect(check()).toBeNull();
    expect(screen.getByText("Inside a leaf")).toBeInTheDocument();
    expect(screen.getByText("Segment 1 of 2")).toBeInTheDocument();
  });

  it("sends one navigation_fragmentation for the move out, as Back does", async () => {
    await openCheck();
    expect(fragmentation()).toHaveLength(0);

    escape();

    expect(fragmentation()).toHaveLength(1);
    expect(fragmentation()[0][1]).toEqual({
      indicator: "navigation_fragmentation",
      value: 1,
    });
  });

  it("asks the same check again on Next, and the move back in counts nothing", async () => {
    await openCheck();
    escape();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(check()).toBeInTheDocument();
    expect(screen.getByText("What do plants take in?")).toBeInTheDocument();
    expect(screen.getByText("Segment 1 of 2")).toBeInTheDocument();
    expect(fragmentation()).toHaveLength(1);
  });

  it("asks a missed check afresh, its last pick gone", async () => {
    await openCheck();
    fireEvent.click(screen.getByRole("button", { name: /Oxygen/ }));
    escape();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.queryByText("Not quite. Let's look again.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("records no tap_blocked for a scrim tap, because the scrim blocks nothing now", async () => {
    await openCheck();

    fireEvent.pointerDown(scrim());

    expect(blocked()).toHaveLength(0);
  });
});

describe("no way on past a check that has not been passed (Olayinka, 23 Oct)", () => {
  it("has no way on before an answer, nor after a miss", async () => {
    const wayOn = () =>
      screen.queryByRole("button", { name: /^(Continue|Keep going)$/ });
    await openCheck();
    expect(wayOn()).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Oxygen/ }));

    expect(screen.getByText(RECOVERY_LINE)).toBeInTheDocument();
    expect(wayOn()).toBeNull();
  });

  it("keeps the child on the section however they leave the sheet", async () => {
    await openCheck();
    fireEvent.click(screen.getByRole("button", { name: /Oxygen/ }));
    escape();

    expect(screen.getByText("Inside a leaf")).toBeInTheDocument();
    expect(screen.queryByText("Next")).toBeNull();
  });
});

describe("after a miss (D93; 17d S1, on every check since 26 Oct)", () => {
  it("holds the pick with the frame's line, gives way, and Next asks it afresh", async () => {
    await openCheck();
    fireEvent.click(screen.getByRole("button", { name: /Oxygen/ }));

    expect(screen.getByText(RECOVERY_LINE)).toBeInTheDocument();
    expect(screen.queryByText("Not quite. Let's look again.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.queryByRole("button", { name: /See it explained/i })).toBeNull();
    expect(screen.queryByText(/progress is saved/i)).toBeNull();

    // It gives way by itself, the child still on the section...
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), {
      timeout: GIVES_WAY_AFTER_MS + 2000,
    });
    expect(screen.getByText("Inside a leaf")).toBeInTheDocument();
    // ...and Next asks the question again, answerable straight away.
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.queryByText(RECOVERY_LINE)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Carbon dioxide/ }));
    expect(screen.getByText("That's it.")).toBeInTheDocument();
  });
});

describe("after a passed check (D185)", () => {
  it("says Lydia's line, about the work and not the child", async () => {
    await openCheck();
    fireEvent.click(screen.getByRole("button", { name: /Carbon dioxide/ }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(screen.getByText("That's it. Here's what's next.")).toBeInTheDocument();
    expect(screen.queryByText(/Nice/)).toBeNull();
  });
});
