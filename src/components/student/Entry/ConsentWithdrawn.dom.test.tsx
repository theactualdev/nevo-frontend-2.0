import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ConsentWithdrawn } from "./ConsentWithdrawn";
import StudentUnavailablePage from "@/app/student/unavailable/page";

/**
 * 00e Consent Withdrawn (D117): "a calm, still dot rather than the breathing
 * one, no 'soon', no countdown, no button, no sign-in route. It never uses the
 * word consent, never mentions a parent, never mentions withdrawal, and never
 * implies a decision was made about the child by anybody."
 */

afterEach(() => {
  cleanup();
});

describe("ConsentWithdrawn", () => {
  it("says what 00e says, verbatim", () => {
    render(<ConsentWithdrawn />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Nevo isn't available to you at the moment",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Someone at home or at school can tell you more."),
    ).toBeInTheDocument();
  });

  it("is not 00d: no soon, and a still dot rather than the breathing one", () => {
    render(<ConsentWithdrawn />);

    expect(document.body.textContent).not.toMatch(/soon|ready|wait/i);
    const dot = document.querySelector("span[aria-hidden='true']");
    expect(dot).toBeTruthy();
    expect(dot?.className).not.toMatch(/animate/);
  });

  it("names no consent, parent, withdrawal or decision", () => {
    render(<ConsentWithdrawn />);

    expect(document.body.textContent).not.toMatch(
      /consent|parent|withdr|decid|removed|permission/i,
    );
  });

  it("offers nothing to press and no way to sign in", () => {
    render(<ConsentWithdrawn />);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("is the page a withdrawn child is sent to", () => {
    render(<StudentUnavailablePage />);

    expect(
      screen.getByRole("heading", {
        name: "Nevo isn't available to you at the moment",
      }),
    ).toBeInTheDocument();
  });
});
