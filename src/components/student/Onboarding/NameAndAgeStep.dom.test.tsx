import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NameAndAgeStep } from "./NameAndAgeStep";
import {
  clearOnboardingDraft,
  mergeOnboardingDraft,
} from "@/lib/auth/onboarding";

/**
 * A child can reach this screen having already answered it.
 *
 * The class step's empty-roster dead end routes back to Teacher Join, which
 * resumes at this screen - so a child who gave their name two screens ago was
 * asked for it again with the box blank, as though nothing they had done had
 * counted. For a child who finds typing effortful that is not a small thing.
 */

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  clearOnboardingDraft();
});

afterEach(() => {
  cleanup();
  clearOnboardingDraft();
});

describe("NameAndAgeStep", () => {
  it("remembers what a child already told us", () => {
    mergeOnboardingDraft({ name: "Amara", age: 9 });

    render(<NameAndAgeStep />);

    expect(screen.getByLabelText("Your name")).toHaveValue("Amara");
  });

  it("starts empty for a child arriving for the first time", () => {
    render(<NameAndAgeStep />);

    expect(screen.getByLabelText("Your name")).toHaveValue("");
  });

  it("does not blank a name that is already there", () => {
    // An effect-based prefill would clear the field for a frame, and fight
    // anything typed before it ran.
    mergeOnboardingDraft({ name: "Amara", age: 9 });
    render(<NameAndAgeStep />);

    const field = screen.getByLabelText("Your name");
    fireEvent.change(field, { target: { value: "Amara Kalu" } });

    expect(field).toHaveValue("Amara Kalu");
  });
});

/**
 * The step-1 frame docks the Nevo keyboard on the age field as well as the
 * name. Age was the one field on the screen that opened the tablet's own
 * keyboard instead, over the top of the layout the frame draws.
 */
describe("NameAndAgeStep keyboard", () => {
  const tap = (label: string) =>
    fireEvent.click(screen.getByRole("button", { name: label }));

  it("keeps the device keyboard down on the age field", () => {
    render(<NameAndAgeStep />);

    expect(screen.getByLabelText("Age")).toHaveAttribute("inputmode", "none");
  });

  it("docks the Nevo keyboard when the age field is touched", () => {
    render(<NameAndAgeStep />);
    expect(screen.queryByRole("group", { name: "On-screen keyboard" })).toBeNull();

    fireEvent.focus(screen.getByLabelText("Age"));

    expect(screen.getByRole("group", { name: "On-screen keyboard" })).toBeInTheDocument();
  });

  it("types into the age when the age was touched last, and nowhere else", () => {
    render(<NameAndAgeStep />);

    fireEvent.focus(screen.getByLabelText("Age"));
    tap("123");
    tap("9");

    expect(screen.getByLabelText("Age")).toHaveValue("9");
    expect(screen.getByLabelText("Your name")).toHaveValue("");
  });

  it("keeps only digits in the age, whatever key is pressed", () => {
    render(<NameAndAgeStep />);

    fireEvent.focus(screen.getByLabelText("Age"));
    tap("A");
    tap("123");
    tap("1");
    tap("2");
    tap("3");

    expect(screen.getByLabelText("Age")).toHaveValue("12");
  });

  it("still types the name when the name was touched", () => {
    render(<NameAndAgeStep />);

    fireEvent.focus(screen.getByLabelText("Your name"));
    tap("A");
    tap("d");
    tap("a");

    expect(screen.getByLabelText("Your name")).toHaveValue("Ada");
    expect(screen.getByLabelText("Age")).toHaveValue("");
  });
});
