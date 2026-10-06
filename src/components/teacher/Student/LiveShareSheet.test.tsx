import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/api/escalations", () => ({ escalationsApi: { create } }));

import { LiveShareSheet } from "./LiveShareSheet";

/**
 * C.8b Share with Learning Support, on a real student.
 *
 * WHAT THIS GUARDS. This sheet raises a safeguarding concern with a SENCo, so
 * the failure that matters is not a broken layout - it is a teacher believing
 * a referral was made when nothing left the browser. An earlier version of the
 * fixture sheet did exactly that: its send button closed the sheet and the
 * profile then showed "Shared with Learning Support", over a handler that
 * posted nothing.
 *
 * So the assertions are about ORDER and CONSEQUENCE: nothing is dismissed,
 * confirmed or noted until `escalationsApi.create` has resolved, and a
 * rejection keeps the teacher's words on screen. A test that merely checked
 * the confirmation appears would have passed against the lying version.
 *
 * Since C.8c the form's button only opens the confirm step; "Yes, send" is
 * the write. `send()` below presses both, as a teacher would.
 */

const show = (props: Record<string, unknown> = {}) => {
  const onCancel = vi.fn();
  const onSent = vi.fn();
  render(
    <LiveShareSheet
      studentId="s-1"
      firstName="Amara"
      onCancel={onCancel}
      onSent={onSent}
      {...props}
    />,
  );
  return { onCancel, onSent };
};

const type = (text: string) =>
  fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });

const sendBtn = () =>
  screen.getByRole("button", { name: "Send to Learning Support" });

const send = () => {
  fireEvent.click(sendBtn());
  fireEvent.click(screen.getByRole("button", { name: "Yes, send" }));
};

beforeEach(() => {
  create.mockReset();
  create.mockResolvedValue({ id: "e-1" });
});

describe("sending", () => {
  it("sends the note about this student", async () => {
    const { onSent } = show();
    type("She has gone very quiet in group work this fortnight.");
    send();

    expect(create).toHaveBeenCalledWith({
      studentId: "s-1",
      note: "She has gone very quiet in group work this fortnight.",
    });
    await screen.findByRole("dialog");
    expect(onSent).toHaveBeenCalledTimes(1);
  });

  it("never dismisses before the write resolves", async () => {
    let resolve: (v: unknown) => void = () => {};
    create.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const { onSent } = show();
    type("Something is worrying me.");
    send();

    // Mid-flight. The version this replaces confirmed here, with no write at
    // all behind it.
    expect(onSent).not.toHaveBeenCalled();

    resolve({ id: "e-1" });
    await vi.waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
  });

  it("trims the note, so a stray newline is not the referral", () => {
    show();
    type("   He is struggling to settle after break.  \n");
    send();

    expect(create).toHaveBeenCalledWith({
      studentId: "s-1",
      note: "He is struggling to settle after break.",
    });
  });

  it("does not attach a flag the teacher never chose", () => {
    // `attentionFlagId` is optional and obtainable - flags carry ids and the
    // console already reads them. It is omitted because C.8b never asks which
    // flag this is about, and guessing would tell the SENCo the wrong thing.
    show();
    type("Worth a look.");
    send();

    expect(create).toHaveBeenCalledWith(
      expect.not.objectContaining({ attentionFlagId: expect.anything() }),
    );
  });
});

describe("when the send fails", () => {
  it("says so, and does not report a referral", async () => {
    create.mockRejectedValueOnce(new Error("500"));
    const { onSent } = show();
    type("She has gone very quiet.");
    send();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Nothing has reached your SENCo/i,
    );
    expect(onSent).not.toHaveBeenCalled();
  });

  it("keeps the teacher's words so they are not retyped", async () => {
    create.mockRejectedValueOnce(new Error("500"));
    show();
    type("He asked to sit on his own again today.");
    send();

    await screen.findByRole("alert");
    expect(screen.getByRole("textbox")).toHaveValue(
      "He asked to sit on his own again today.",
    );
  });

  it("lets them try again after a failure", async () => {
    create.mockRejectedValueOnce(new Error("500"));
    const { onSent } = show();
    type("Please take a look.");
    send();
    await screen.findByRole("alert");

    create.mockResolvedValueOnce({ id: "e-2" });
    send();
    await vi.waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe("what it will not send", () => {
  it("will not send an empty note", () => {
    show();

    expect(sendBtn()).toBeDisabled();
    fireEvent.click(sendBtn());
    expect(create).not.toHaveBeenCalled();
  });

  it("treats whitespace as no note at all", () => {
    show();
    type("    \n  ");

    expect(sendBtn()).toBeDisabled();
    fireEvent.click(sendBtn());
    expect(create).not.toHaveBeenCalled();
  });
});

describe("closing", () => {
  it("cancels on Escape without sending", () => {
    const { onCancel } = show();
    type("Half a thought.");
    fireEvent.keyDown(window, { key: "Escape" });

    expect(onCancel).toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("promises the recent picture, which the server attaches", () => {
    // The copy says a note goes "along with Amara's recent picture".
    // `recentPicture` is response-only and derived server-side, so this sheet
    // must not assemble and post one - the promise is kept elsewhere.
    show();
    type("A note.");
    send();

    expect(create).toHaveBeenCalledWith(
      expect.not.objectContaining({ recentPicture: expect.anything() }),
    );
    // The confirm step repeats the promise, so it may be said twice.
    expect(screen.getAllByText(/recent picture/).length).toBeGreaterThan(0);
  });
});

/**
 * C.8c: the form's button asks once more before anything is posted.
 */
describe("the confirm step", () => {
  it("posts nothing until Yes, send", () => {
    show();
    type("She has gone very quiet.");
    fireEvent.click(sendBtn());

    expect(screen.getByRole("heading", { name: "Send to Learning Support?" })).toBeInTheDocument();
    expect(screen.getByText(/Amara’s recent picture and the note you wrote/)).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("goes back to the note, unchanged, from Back", () => {
    show();
    type("He asked to sit on his own again.");
    fireEvent.click(sendBtn());
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByRole("textbox")).toHaveValue("He asked to sit on his own again.");
    expect(create).not.toHaveBeenCalled();
  });

  it("holds Back while the send is in flight", () => {
    create.mockReturnValueOnce(new Promise(() => {}));
    show();
    type("Something is worrying me.");
    send();

    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Sending/ })).toBeDisabled();
  });
});
