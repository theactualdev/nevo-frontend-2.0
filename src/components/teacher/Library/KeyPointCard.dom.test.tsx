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

    expect(screen.queryByText(/From your file/i)).not.toBeInTheDocument();
    open();

    expect(screen.getByText(/From your file/i)).toBeInTheDocument();
  });

  it("shows the document's own words, and what Nevo made of them", () => {
    show();
    open();

    expect(
      screen.getByText(/rewrite both fractions over a common base/),
    ).toBeInTheDocument();
    expect(screen.getByText(/What Nevo read/i)).toBeInTheDocument();
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

    expect(screen.getByText("Worth a check")).toBeInTheDocument();
  });

  it("tells a point a TEACHER settled from one Nevo never doubted", () => {
    /*
     * THE ONE THAT CHANGED MEANING, not just wording. The first build drew a
     * violet edge on anything outstanding and nothing at all on the rest, so
     * a point Nevo was confident about looked identical to one the teacher
     * had just accepted - and a teacher working down a list could not see
     * what they had done. C06b draws three marks; the contract already
     * carried the distinction in `reviewState`.
     */
    const { unmount } = render(
      <KeyPointCard
        keyPoint={kp({ outstanding: false, reviewState: "accepted" })}
        working={null}
        failed={false}
        onAccept={vi.fn()}
        onAmend={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText("Checked")).toBeInTheDocument();
    unmount();

    show({ outstanding: false, reviewState: "settled" });
    expect(screen.queryByText("Checked")).not.toBeInTheDocument();
    expect(screen.queryByText("Worth a check")).not.toBeInTheDocument();
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

    expect(screen.queryByText("Worth a check")).not.toBeInTheDocument();
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

  it("says on the closed card that it has been dealt with", () => {
    // C06b's "Checked" chip, which is how a teacher sees their own work in a
    // list they are working down.
    show({
      amendedText: "Rewrite both fractions over a common base.",
      outstanding: false,
      reviewState: "amended",
    });

    expect(screen.getByText("Checked")).toBeInTheDocument();
  });
});

describe("the three actions", () => {
  it("accepts it as it is", () => {
    const { onAccept } = show();
    open();

    fireEvent.click(screen.getByRole("button", { name: "Accept" }));

    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("offers no accept on a point that is already settled", () => {
    // Nothing is waiting on it. A button that settles what is settled is a
    // click for its own sake, which is the tax this ticket rules out.
    show({ outstanding: false, reviewState: "settled" });
    open();

    expect(
      screen.queryByRole("button", { name: "Accept" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Edit wording" }),
    ).toBeInTheDocument();
  });

  it("sends the new wording", () => {
    const { onAmend } = show();
    open();
    fireEvent.click(screen.getByRole("button", { name: "Edit wording" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Edit wording" }));

    expect(screen.getByLabelText(/Your wording/)).toHaveValue(
      "Rewrite both fractions over a common base.",
    );
  });

  it("sends nothing for an emptied box, and does not read it as a removal", () => {
    // There is a control for removing. Guessing between the two would delete
    // a point a teacher only meant to clear.
    const { onAmend, onRemove } = show();
    open();
    fireEvent.click(screen.getByRole("button", { name: "Edit wording" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Edit wording" }));
    fireEvent.click(screen.getByRole("button", { name: "Save this wording" }));

    expect(onAmend).not.toHaveBeenCalled();
  });

  it("asks before removing, and says there is no way back", () => {
    const { onRemove } = show();
    open();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getByText(/can’t put it back from here/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Yes, remove it" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("lets a teacher change their mind about removing", () => {
    const { onRemove } = show();
    open();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));

    expect(onRemove).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Accept" }),
    ).toBeInTheDocument();
  });
});

describe("once a point has been dealt with", () => {
  it("folds itself away, so the list shortens as a teacher works down it", () => {
    // QA, 22 Sep. C06b draws a checked card as a COLLAPSED row with a tick,
    // not a hidden one - so this closes rather than disappears.
    const { rerender } = render(
      <KeyPointCard
        keyPoint={kp()}
        working={null}
        failed={false}
        onAccept={vi.fn()}
        onAmend={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    open();
    expect(screen.getByText(/From your file/i)).toBeInTheDocument();

    rerender(
      <KeyPointCard
        keyPoint={kp({ outstanding: false, reviewState: "accepted" })}
        working={null}
        failed={false}
        onAccept={vi.fn()}
        onAmend={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.queryByText(/From your file/i)).not.toBeInTheDocument();
    expect(screen.getByText("Checked")).toBeInTheDocument();
  });

  it("folds away on a re-worded point, where the state does not move", () => {
    /*
     * A mutation run found this. Dropping `text` from the version stamp
     * killed nothing, because every other case here changes `reviewState`
     * as well - and a teacher editing an already-amended point changes only
     * the wording. Without it their card would sit open after the save,
     * which is the exact complaint QA raised.
     */
    const amended = { outstanding: false, reviewState: "amended" as const };
    const { rerender } = render(
      <KeyPointCard
        keyPoint={kp({ ...amended, text: "First wording." })}
        working={null}
        failed={false}
        onAccept={vi.fn()}
        onAmend={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    open();
    expect(screen.getByText(/From your file/i)).toBeInTheDocument();

    rerender(
      <KeyPointCard
        keyPoint={kp({ ...amended, text: "Second wording." })}
        working={null}
        failed={false}
        onAccept={vi.fn()}
        onAmend={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.queryByText(/From your file/i)).not.toBeInTheDocument();
  });

  it("can still be opened afterwards", () => {
    // Collapsed, not gone: a teacher can check what they accepted.
    show({ outstanding: false, reviewState: "accepted" });

    open();

    expect(screen.getByText(/From your file/i)).toBeInTheDocument();
  });

  it("stays open on a refusal, where the teacher is looking", () => {
    // The failure line is inside the card. Folding it away on a failed
    // action would hide the only thing that explains it.
    show({}, { failed: true });
    open();

    expect(screen.getByText(/didn’t go through/)).toBeInTheDocument();
    expect(screen.getByText(/From your file/i)).toBeInTheDocument();
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
      screen.getByRole("button", { name: "Accept" }),
    ).toBeInTheDocument();
  });
});
