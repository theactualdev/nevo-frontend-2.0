import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LessonPlayer } from "./LessonPlayer";
import { SIGNAL_EVENT_TYPES } from "@/lib/constants";
import type { Lesson } from "@/lib/types";

/**
 * THE QUICK CHECK, AS IA 31 HAS IT: "No manual dismiss".
 *
 * A scrim tap or Esc closed it, so a child could step round the check the
 * player gates on - and every scrim tap anywhere was recorded as
 * `tap_blocked`, including the ones that dismissed something.
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

beforeEach(() => {
  trackEvent.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("no manual dismiss", () => {
  // The scrim half is pinned in `QuickCheckSheet.dom.test.tsx`: Radix never
  // sees an outside tap in jsdom, so a scrim test here passes either way.
  it("stays open through Esc", async () => {
    await openCheck();

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });

    expect(check()).toBeInTheDocument();
  });
});

describe("what a scrim tap records", () => {
  it("records tap_blocked while the check is up, because it was", async () => {
    await openCheck();

    fireEvent.pointerDown(scrim());

    expect(blocked()).toHaveLength(1);
    // The catalogue's two keys: what was tapped, and why it was refused - the
    // modal's busy window, which it was sent without until 6 Oct.
    expect(blocked()[0][1]).toEqual({
      target: "scrim",
      reason: "blocked_by_modal",
    });
  });

  it("records nothing for a scrim tap while the check is not up", () => {
    // Every sheet broadcasts its scrim taps; the player listened to all of
    // them, including the ones that dismissed something.
    render(<LessonPlayer lesson={LESSON} plan={null} />);

    act(() => {
      window.dispatchEvent(new CustomEvent("nevo-scrim-tap"));
    });

    expect(blocked()).toHaveLength(0);
  });
});

describe("after a miss (D93)", () => {
  it("offers Try again alone, and no See it explained", async () => {
    await openCheck();
    fireEvent.click(screen.getByRole("button", { name: /Oxygen/ }));

    expect(screen.getByText("Not quite. Let's look again.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /See it explained/i })).toBeNull();
    expect(screen.queryByText(/progress is saved/i)).toBeNull();

    // Try again puts the question back, answerable straight away.
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.queryByText("Not quite. Let's look again.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Carbon dioxide/ }));
    expect(screen.getByText("That's it.")).toBeInTheDocument();
  });
});
