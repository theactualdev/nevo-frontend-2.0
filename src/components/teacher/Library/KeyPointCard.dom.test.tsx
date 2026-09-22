import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { KeyPointCard } from "./KeyPointCard";
import type { KeyPoint } from "@/lib/api/lessons";

/**
 * SCRUM-153, LR-02: the card a teacher opens to check what Nevo drew from.
 *
 * "Key points are extracted and shown as cards, but a card cannot be clicked
 * or expanded. There is no way to see what Nevo drew from." Expandable was the
 * missing piece, and without it the product demanded a review it gave no means
 * to perform.
 *
 * An earlier attempt at this card reviewed a SEGMENT, because a key point
 * carried no state or confidence in the contract. It does now, and the two
 * assertions that matter most here are the ones that keep the server's
 * judgement the server's: the marker follows `outstanding`, never confidence,
 * and an amendment is shown BESIDE what Nevo read rather than over it.
 */

const kp = (over: Partial<KeyPoint> = {}): KeyPoint =>
  ({
    id: "kp-1",
    segmentId: "s-1",
    segmentTitle: "Adding unlike denominators",
    position: 2,
    text: "You need a common denominator first.",
    extractedText: "You need a common denominator first.",
    amendedText: null,
    sourceText: "Before adding, rewrite both fractions over a common base.",
    confidence: "low",
    reviewState: "unsure",
    outstanding: true,
    resolvedAt: null,
    resolvedBy: null,
    ...over,
  }) as KeyPoint;

const show = (over: Partial<KeyPoint> = {}, props = {}) => {
  const handlers = {
    onAccept: vi.fn(),
    onAmend: vi.fn(),
    onRemove: vi.fn(),
  };
  render(
    <KeyPointCard
      keyPoint={kp(over)}
      working={null}
      failed={false}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
};

const open = () =>
  fireEvent.click(screen.getByRole("button", { expanded: false }));

describe("the card a teacher can open", () => {
  it("opens", () => {
    show();

    expect(screen.queryByText(/What the document says/i)).not.toBeInTheDocument();
    open();

    expect(screen.getByText(/What the document says/i)).toBeInTheDocument();
  });

  it("shows the document's own words, and what Nevo made of them", () => {
    show();
    open();

    expect(
      screen.getByText(/rewrite both fractions over a common base/),
    ).toBeInTheDocument();
    expect(screen.getByText(/What Nevo read/i)).toBeInTheDocument();
  });

  it("names the section it came from, and numbers one the parse left unnamed", () => {
    show({ segmentTitle: null });

    expect(screen.getByText("Section 2")).toBeInTheDocument();
  });

  it("says so rather than showing an empty quote when the passage is gone", () => {
    show({ sourceText: "" });
    open();

    expect(screen.getByText(/didn’t keep the passage/)).toBeInTheDocument();
  });
});

describe("whose judgement the marker is", () => {
  it("marks a point the SERVER says is outstanding", () => {
    show({ outstanding: true });

    expect(screen.getByText("Worth a look")).toBeInTheDocument();
  });

  it("does not mark a grounded point, whatever its confidence says", () => {
    /*
     * THE ASSERTION THIS FILE EXISTS FOR. Reading `confidence: "low"` as
     * "needs attention" would be this console deciding a threshold the engine
     * owns - and it would be wrong the moment backend changes what grounds a
     * point. `outstanding` is the server's answer; confidence only explains
     * it once the card is open.
     */
    show({ outstanding: false, reviewState: "accepted", confidence: "low" });

    expect(screen.queryByText("Worth a look")).not.toBeInTheDocument();
  });

  it("explains what was measured, never prints the grade", () => {
    // "LOW" on a card tells a teacher nothing they can act on.
    show({ confidence: "low" });
    open();

    expect(screen.getByText(/couldn’t find this wording/)).toBeInTheDocument();
    expect(screen.queryByText(/^low$/i)).not.toBeInTheDocument();
  });

  it("says something different when only part of it was found", () => {
    show({ confidence: "medium" });
    open();

    expect(screen.getByText(/Only part of this wording/)).toBeInTheDocument();
  });
});

describe("a point the teacher has already reworded", () => {
  it("keeps what Nevo read beside it, never over it", () => {
    /*
     * Backend asked for this by name, and both fields exist for it. A teacher
     * who rewrote a point last week and comes back to it can still see what
     * they were correcting; a screen that overwrote it leaves them
     * re-deciding from nothing.
     */
    show({
      text: "Rewrite both fractions over a common base.",
      extractedText: "You need a common denominator first.",
      amendedText: "Rewrite both fractions over a common base.",
    });
    open();

    expect(
      screen.getByText("You need a common denominator first."),
    ).toBeInTheDocument();
    expect(screen.getByText("Your wording")).toBeInTheDocument();
  });

  it("says on the closed card that a teacher changed it", () => {
    show({ amendedText: "Rewrite both fractions over a common base." });

    expect(screen.getByText(/you changed this/)).toBeInTheDocument();
  });
});

describe("the three actions", () => {
  it("accepts it as it is", () => {
    const { onAccept } = show();
    open();

    fireEvent.click(screen.getByRole("button", { name: "Accept as it is" }));

    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("offers no accept on a point that is already settled", () => {
    // Nothing is waiting on it. A button that settles what is settled is a
    // click for its own sake, which is the tax this ticket rules out.
    show({ outstanding: false, reviewState: "settled" });
    open();

    expect(
      screen.queryByRole("button", { name: "Accept as it is" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Change the wording" }),
    ).toBeInTheDocument();
  });

  it("sends the new wording", () => {
    const { onAmend } = show();
    open();
    fireEvent.click(screen.getByRole("button", { name: "Change the wording" }));

    fireEvent.change(screen.getByLabelText(/Your wording/), {
      target: { value: "  Rewrite both over a common base.  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save this wording" }));

    expect(onAmend).toHaveBeenCalledWith("Rewrite both over a common base.");
  });

  it("seeds the box with what is in force, not with what Nevo read", () => {
    // A teacher refining their own wording should not have to retype it.
    show({
      text: "Rewrite both fractions over a common base.",
      extractedText: "You need a common denominator first.",
      amendedText: "Rewrite both fractions over a common base.",
    });
    open();
    fireEvent.click(screen.getByRole("button", { name: "Change the wording" }));

    expect(screen.getByLabelText(/Your wording/)).toHaveValue(
      "Rewrite both fractions over a common base.",
    );
  });

  it("sends nothing for an emptied box, and does not read it as a removal", () => {
    // There is a control for removing. Guessing between the two would delete
    // a point a teacher only meant to clear.
    const { onAmend, onRemove } = show();
    open();
    fireEvent.click(screen.getByRole("button", { name: "Change the wording" }));

    fireEvent.change(screen.getByLabelText(/Your wording/), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save this wording" }));

    expect(onAmend).not.toHaveBeenCalled();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("sends nothing when the wording did not change", () => {
    const { onAmend } = show();
    open();
    fireEvent.click(screen.getByRole("button", { name: "Change the wording" }));
    fireEvent.click(screen.getByRole("button", { name: "Save this wording" }));

    expect(onAmend).not.toHaveBeenCalled();
  });

  it("asks before removing, and says there is no way back", () => {
    const { onRemove } = show();
    open();

    fireEvent.click(screen.getByRole("button", { name: "Remove it" }));
    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getByText(/can’t put it back from here/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Yes, remove it" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("lets a teacher change their mind about removing", () => {
    const { onRemove } = show();
    open();
    fireEvent.click(screen.getByRole("button", { name: "Remove it" }));

    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));

    expect(onRemove).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Accept as it is" }),
    ).toBeInTheDocument();
  });
});

describe("while an action is in flight", () => {
  it("says which one, on the control that was pressed", () => {
    show({}, { working: "accept" });
    open();

    expect(
      screen.getByRole("button", { name: "Accepting…" }),
    ).toBeInTheDocument();
  });

  it("refuses a second press", () => {
    const { onAccept } = show({}, { working: "accept" });
    open();

    const control = screen.getByRole("button", { name: "Accepting…" });
    expect(control).toBeDisabled();
    fireEvent.click(control);
    expect(onAccept).not.toHaveBeenCalled();
  });
});

describe("when it does not land", () => {
  it("says nothing changed, and leaves the actions where they were", () => {
    show({}, { failed: true });
    open();

    expect(screen.getByText(/didn’t go through/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Accept as it is" }),
    ).toBeInTheDocument();
  });
});
