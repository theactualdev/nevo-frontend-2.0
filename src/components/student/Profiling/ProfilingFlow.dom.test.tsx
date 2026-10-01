import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProfilingFlow } from "./ProfilingFlow";
import {
  clearOnboardingDraft,
  mergeOnboardingDraft,
} from "@/lib/auth/onboarding";

/**
 * The band decides what a child is asked to do, so it must never be a guess.
 *
 * It sets the grid size, the span ceiling, whether the dual task runs, and
 * which domain questions appear. It comes from the age given in onboarding
 * Step 1 - and when that was missing it fell back to a FIXTURE's "Year 4".
 *
 * A child arriving by SSO never sees Step 1. So EVERY SSO child sat the Primary
 * 4-6 baseline: a sixteen-year-old on a 4x4 grid with no dual task, and a
 * seven-year-old with SEND asked "What is 15% of 200?" in their first minutes
 * in Nevo. The comment beside the fallback named a different draft-less path (a
 * re-run from Profile) and missed the one that ships.
 *
 * The roster's band now decides first where there is one to read (see
 * ProfilingFlow.band). When nothing says, we ask.
 */

beforeEach(() => {
  clearOnboardingDraft();
});

afterEach(() => {
  cleanup();
  clearOnboardingDraft();
});

describe("ProfilingFlow — how the band is decided", () => {
  it("asks a child with no age on record, rather than assuming one", () => {
    // No onboarding draft, and no roster band to read.
    render(<ProfilingFlow onDone={vi.fn()} />);

    expect(screen.getByText(/how old are you/i)).toBeTruthy();
  });

  it("will not start the run until it has a real answer", () => {
    render(<ProfilingFlow onDone={vi.fn()} />);

    // Starting without one is what produced the fixture-banded run.
    expect(screen.getByRole("button", { name: /let's go/i })).toBeDisabled();
  });

  it("does not ask a child who already told us in Step 1", () => {
    mergeOnboardingDraft({ name: "Amara", age: 9 });

    render(<ProfilingFlow onDone={vi.fn()} />);

    expect(screen.queryByText(/how old are you/i)).toBeNull();
    expect(
      screen.getByRole("button", { name: /let's go/i }),
    ).not.toBeDisabled();
  });

  it("starts once the child answers", () => {
    render(<ProfilingFlow onDone={vi.fn()} />);
    // Exact: the stepper also has "Decrease age" / "Increase age" buttons.
    const field = screen.getByLabelText("Age");

    fireEvent.change(field, { target: { value: "7" } });

    expect(
      screen.getByRole("button", { name: /let's go/i }),
    ).not.toBeDisabled();
  });
});
