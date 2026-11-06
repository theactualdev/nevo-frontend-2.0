import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { create, holders } = vi.hoisted(() => ({ create: vi.fn(), holders: vi.fn() }));
vi.mock("@/lib/api/escalations", () => ({
  escalationsApi: { create },
  CONCERN_RECIPIENT_UNAVAILABLE: "concern_recipient_unavailable",
}));
// SCRUM-305: the sheet asks who would receive it. Someone holds learning
// support unless a test says otherwise - the sheet as it always was.
vi.mock("@/lib/api/learningSupport", async (actual) => {
  const real = await actual<typeof import("@/lib/api/learningSupport")>();
  return { ...real, learningSupportApi: { ...real.learningSupportApi, holders } };
});

import { ApiError } from "@/lib/api/client";
import { clearSession, setSession } from "@/lib/auth/session";
import { writeKeptDraft, readKeptDraft } from "@/lib/drafts/keptDraft";
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
  holders.mockReset();
  holders.mockResolvedValue({
    holders: [{ userId: "u-ls", name: "Mrs. Okafor", role: "teacher", grantedAt: "2026-10-01T00:00:00Z", grantedBy: "u-a" }],
    viewerHoldsIt: false,
    fallbackRecipient: null,
  });
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
    // "your SENCo" only once the read has said someone holds it (SCRUM-305).
    await screen.findByText(/A note goes to your SENCo/);
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

/** Whether the browser would ask before leaving: the event was cancelled. */
const leavingAsks = () => {
  const e = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
};

describe("a note not yet sent", () => {
  it("makes the browser ask before a refresh throws it away", () => {
    show();
    expect(leavingAsks()).toBe(false);

    type("She has gone very quiet.");
    expect(leavingAsks()).toBe(true);
  });
});

/**
 * SCRUM-246, part 2: a note being written survives the session lapsing, and
 * comes back as the teacher's own unsaved work, to put back or let go.
 */
describe("a note from before the session lapsed", () => {
  beforeEach(() => {
    clearSession();
    window.localStorage.clear();
    setSession({
      token: "tok",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      userId: "t-1",
      role: "teacher",
    });
    writeKeptDraft("share:s-1", "Quieter than usual since Monday.");
  });

  it("is offered, not laid over the empty box", () => {
    show();

    expect(screen.getByText(/This wasn.t saved before you left it/)).toBeInTheDocument();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
  });

  it("goes back in the box when the teacher puts it back", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Put it back" }));

    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Quieter than usual since Monday.");
    expect(screen.queryByText(/This wasn.t saved before you left it/)).not.toBeInTheDocument();
  });

  it("is gone when the teacher discards it", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Discard it" }));

    expect(readKeptDraft("share:s-1")).toBeNull();
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
  });
});

/*
 * A note kept only while the teacher is taken from it. Sent, or closed on
 * purpose, it is not offered back next time as if it were still unsaved.
 */
describe("a note that is sent, or closed on purpose", () => {
  beforeEach(() => {
    clearSession();
    window.localStorage.clear();
    setSession({
      token: "tok",
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      userId: "t-1",
      role: "teacher",
    });
  });

  it("is kept while it is being written", async () => {
    show();
    type("Quieter than usual since Monday.");

    await waitFor(() => expect(readKeptDraft("share:s-1")?.value).toBe("Quieter than usual since Monday."));
  });

  it("is not kept once it is sent", async () => {
    const { onSent } = show();
    type("Quieter than usual since Monday.");
    await waitFor(() => expect(readKeptDraft("share:s-1")).not.toBeNull());
    send();

    await waitFor(() => expect(onSent).toHaveBeenCalled());
    expect(readKeptDraft("share:s-1")).toBeNull();
  });

  it("is not kept once the sheet is cancelled", async () => {
    const { onCancel } = show();
    type("Half a thought.");
    await waitFor(() => expect(readKeptDraft("share:s-1")).not.toBeNull());
    fireEvent.keyDown(window, { key: "Escape" });

    expect(onCancel).toHaveBeenCalled();
    expect(readKeptDraft("share:s-1")).toBeNull();
  });
});

/*
 * SCRUM-305 (1397ec4, C.8b states 2-4): a school where nobody holds learning
 * support. The words are the ticket's, approved; the name is ALWAYS the
 * server's; the confirmation records receipt and claims nothing more; and a
 * sheet with no one to send to says it could not be sent.
 */
const noHolder = (fallback: { userId: string; name: string } | null) =>
  holders.mockResolvedValue({ holders: [], viewerHoldsIt: false, fallbackRecipient: fallback });

const refusal = (code: string) => new ApiError(409, code, { detail: { code } });

describe("when nobody holds learning support", () => {
  it("says it goes to the administrator the server names, in the ticket's words", async () => {
    noHolder({ userId: "u-adm", name: "Mrs. Adebayo" });
    show();

    expect(
      await screen.findByText(
        "No one holds learning support at this school yet, so this goes to Mrs. Adebayo, who can assign the role.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send to Mrs. Adebayo" })).toBeInTheDocument();
    expect(screen.queryByText(/your SENCo/)).toBeNull();
    expect(screen.queryByText(/your administrator/i)).toBeNull();
  });

  it("sends from Send to {name}, as the frame draws it, and confirms by the response's name and date", async () => {
    noHolder({ userId: "u-adm", name: "Mrs. Adebayo" });
    create.mockResolvedValue({
      id: "e-1",
      routedTo: "school_admin",
      recipientId: "u-adm",
      recipientName: "Mrs. Adebayo",
      receivedAt: "2026-11-04T09:30:00Z",
    });
    const { onSent } = show();
    type("She has gone very quiet.");
    fireEvent.click(await screen.findByRole("button", { name: "Send to Mrs. Adebayo" }));

    expect(await screen.findByRole("heading", { name: "Sent to Mrs. Adebayo, 4 November" })).toBeInTheDocument();
    expect(create).toHaveBeenCalledWith({ studentId: "s-1", note: "She has gone very quiet." });
    // Receipt only: nothing resolved, actioned or under review, and no
    // pronoun for a person known only by name.
    expect(screen.queryByText(/resolved|actioned|under review|She has|can assign someone/i)).toBeNull();
    expect(onSent).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onSent).toHaveBeenCalledWith({ to: "school_admin", name: "Mrs. Adebayo" });
  });

  it("names whoever the server actually sent it to, not who the read said", async () => {
    noHolder({ userId: "u-adm", name: "Mrs. Adebayo" });
    create.mockResolvedValue({
      id: "e-1",
      routedTo: "school_admin",
      recipientName: "Mr. Eze",
      receivedAt: "2026-11-04T09:30:00Z",
    });
    show();
    type("She has gone very quiet.");
    fireEvent.click(await screen.findByRole("button", { name: "Send to Mrs. Adebayo" }));

    expect(await screen.findByRole("heading", { name: "Sent to Mr. Eze, 4 November" })).toBeInTheDocument();
  });

  it("says it could not be sent when the server has no one to send it to, and keeps the note", async () => {
    noHolder(null);
    create.mockRejectedValue(refusal("concern_recipient_unavailable"));
    const { onSent } = show();
    type("She has gone very quiet.");
    fireEvent.click(screen.getByRole("button", { name: "Send to Learning Support" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, send" }));

    expect(await screen.findByRole("heading", { name: "This couldn’t be sent just now" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "We couldn’t reach the right person for this at your school. Your note is kept, so nothing you wrote is lost. Please try again in a moment.",
      ),
    ).toBeInTheDocument();
    expect(onSent).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("textbox")).toHaveValue("She has gone very quiet.");
  });

  it("tries again from the cannot-send state", async () => {
    noHolder(null);
    create.mockRejectedValueOnce(refusal("concern_recipient_unavailable"));
    create.mockResolvedValueOnce({ id: "e-1", routedTo: "learning_support" });
    const { onSent } = show();
    type("She has gone very quiet.");
    fireEvent.click(screen.getByRole("button", { name: "Send to Learning Support" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, send" }));
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));

    await waitFor(() => expect(onSent).toHaveBeenCalledWith({ to: "learning_support" }));
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("claims no recipient when the read fails, and the server decides", async () => {
    holders.mockRejectedValue(new Error("down"));
    show();
    type("She has gone very quiet.");
    await waitFor(() => expect(holders).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Send to Learning Support" }));

    expect(screen.getByText("This shares Amara’s recent picture and your note.")).toBeInTheDocument();
    expect(screen.queryByText(/your SENCo|No one holds/)).toBeNull();
  });
});

describe("when someone holds learning support", () => {
  it("is the sheet as it was", async () => {
    const { onSent } = show();
    expect(await screen.findByText(/A note goes to your SENCo/)).toBeInTheDocument();
    type("She has gone very quiet.");
    send();

    await waitFor(() => expect(onSent).toHaveBeenCalledWith({ to: "learning_support" }));
  });
});
