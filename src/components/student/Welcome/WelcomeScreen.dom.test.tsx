import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WelcomeScreen } from "./WelcomeScreen";
import {
  clearOnboardingDraft,
  getOnboardingDraft,
  mergeOnboardingDraft,
} from "@/lib/auth/onboarding";

/**
 * 01 Welcome and 02's teacher sheet, after 30 Sep (SCRUM-208): one route in,
 * two doors to it. Both reach the entry screen; the QR scan, the class code
 * and the name-and-age step they used to lead to are gone.
 */

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));

beforeEach(() => {
  push.mockReset();
  clearOnboardingDraft();
});

afterEach(() => {
  cleanup();
  clearOnboardingDraft();
});

describe("the Welcome's two doors", () => {
  it("takes \"I have a school code\" to 05 Entry", () => {
    render(<WelcomeScreen />);

    fireEvent.click(screen.getByRole("button", { name: "I have a school code" }));

    expect(push).toHaveBeenCalledWith("/student/onboarding/school");
  });

  it("opens the teacher sheet with 02's words, and one way on", () => {
    render(<WelcomeScreen />);

    fireEvent.click(
      screen.getByRole("button", { name: "I'm joining through my teacher" }),
    );

    expect(
      screen.getByText(
        "Your teacher will read out your school's code for you to type in.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Enter the school code" }));
    expect(push).toHaveBeenCalledWith("/student/onboarding/teacher-join");
  });

  it("offers no QR scan and no class code", () => {
    render(<WelcomeScreen />);
    fireEvent.click(
      screen.getByRole("button", { name: "I'm joining through my teacher" }),
    );

    expect(document.body.textContent).not.toMatch(/QR|class code/i);
    expect(screen.queryByRole("button", { name: "Scan a QR code" })).toBeNull();
  });
});

describe("a new child at the door", () => {
  it("starts with an empty draft, not the last child's", () => {
    mergeOnboardingDraft({ name: "Someone Else", age: 7, schoolCode: "K7DQ" });

    render(<WelcomeScreen />);

    expect(getOnboardingDraft()).toEqual({});
  });
});
