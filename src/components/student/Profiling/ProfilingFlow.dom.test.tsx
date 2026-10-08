import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
 * ProfilingFlow.band). When nothing says, it asked "How old are you?" - and
 * since 8 Oct it never asks (D153): "we do not ask the child". It runs Primary
 * 4-6, the band the warm-up runs without one (D139), until the class band
 * that design says drives content reaches the client.
 */

beforeEach(() => {
  clearOnboardingDraft();
});

afterEach(() => {
  cleanup();
  clearOnboardingDraft();
});

describe("ProfilingFlow — how the band is decided", () => {
  it("never asks a child with no age on record for one (D153)", () => {
    // No onboarding draft, and no roster band to read.
    render(<ProfilingFlow onDone={vi.fn()} />);

    expect(screen.queryByText(/how old are you/i)).toBeNull();
    expect(screen.queryByLabelText("Age")).toBeNull();
    expect(
      screen.getByRole("button", { name: /let's go/i }),
    ).not.toBeDisabled();
  });

  it("does not ask a child who already told us in Step 1", () => {
    mergeOnboardingDraft({ name: "Amara", age: 9 });

    render(<ProfilingFlow onDone={vi.fn()} />);

    expect(screen.queryByText(/how old are you/i)).toBeNull();
    expect(
      screen.getByRole("button", { name: /let's go/i }),
    ).not.toBeDisabled();
  });

});
