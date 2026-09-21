import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";
import type { ParentInvitation } from "@/lib/api/parent";

const { completeConsent, requestCode, verifyCode, setSession } = vi.hoisted(() => ({
  completeConsent: vi.fn(),
  requestCode: vi.fn(),
  verifyCode: vi.fn(),
  setSession: vi.fn(),
}));

// Replaced wholesale - pulling the real module in alongside `client.ts` hangs
// the jsdom worker for 60s. See ParentDataManagement.test.tsx. `apiErrorCode`
// is re-implemented rather than imported for the same reason; it is six lines
// and pinned by its own tests in the node project.
vi.mock("@/lib/api/parent", () => ({
  parentApi: { completeConsent, requestCode, verifyCode },
  apiErrorCode: (detail: unknown) => {
    if (!detail || typeof detail !== "object") return null;
    const inner = (detail as { detail?: unknown }).detail;
    if (!inner || typeof inner !== "object") return null;
    const code = (inner as { code?: unknown }).code;
    return typeof code === "string" && code ? code : null;
  },
}));
vi.mock("@/lib/auth/session", () => ({ setSession }));

import { ParentConsent } from "./ParentConsent";

/**
 * D01b Parent Consent (SCRUM-80).
 *
 * The screen that actually collects consent, so the assertions are about two
 * things: that a tap really reaches the API, and that the page never claims
 * something Nevo has not done. The second matters more than it sounds - this
 * is the page a school points a parent at to satisfy a legal obligation, and
 * a single unfounded sentence on it undermines the rest.
 */

const TOKEN = "consent-token-xyz";

const INVITATION: ParentInvitation = {
  invitationId: "inv-1",
  studentFirstName: "Amara",
  schoolName: "Corona Secondary School",
  schoolPhone: null,
  schoolEmail: null,
  parentName: "Ngozi Okafor",
  parentContact: "ada.okoro@example.com",
  parentContactMethod: "email",
  status: "pending",
  consentTypes: ["data_processing"],
  expiresAt: "2026-12-01T00:00:00Z",
  decidedAt: null,
};

const inv = (over: Partial<ParentInvitation> = {}): ParentInvitation => ({
  ...INVITATION,
  ...over,
});

beforeEach(() => {
  completeConsent.mockReset();
  requestCode.mockReset();
  verifyCode.mockReset();
  setSession.mockReset();
  // 202 with no body a screen can branch on - see `ParentCodeSent`.
  requestCode.mockResolvedValue({ sent: true, expiresAt: "2026-12-01T00:10:00Z" });
  completeConsent.mockResolvedValue({
    invitationId: "inv-1",
    parentLinkId: "pl-1",
    parentId: "p-1",
    studentId: "s-1",
    confirmedTypes: ["data_processing"],
    completedAt: "2026-09-08T10:00:00Z",
    receiptSentTo: null,
  });
});

describe("the request", () => {
  it("names the school and the child, in the school's words", () => {
    render(<ParentConsent token={TOKEN} invitation={inv()} />);

    expect(
      screen.getByRole("heading", {
        name: /Amara[’']s school would like your okay to get Amara started on Nevo\./,
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Corona Secondary School/).length).toBeGreaterThan(0);
  });

  it("states all three promises, including the right to withdraw", () => {
    // "You can withdraw any time" is the one that makes the consent informed.
    render(<ParentConsent token={TOKEN} invitation={inv()} />);

    expect(screen.getByText(/What Amara does/)).toBeInTheDocument();
    expect(screen.getByText(/What we keep/)).toBeInTheDocument();
    expect(screen.getByText(/You stay in control/)).toBeInTheDocument();
    expect(screen.getByText(/You can withdraw any time/)).toBeInTheDocument();
  });

  it("offers one blanket consent and no per-type toggles", () => {
    // Design ruled one consent, one tap: the DSA defines the scope, so there is
    // nothing here to tick. A checkbox would invent a choice the school already
    // made.
    render(<ParentConsent token={TOKEN} invitation={inv()} />);

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Yes, I give my consent/ }),
    ).toBeInTheDocument();
  });

  it("gives the question route equal footing, not a buried link", () => {
    // "No dark patterns" is a literal requirement of this frame.
    render(<ParentConsent token={TOKEN} invitation={inv()} />);
    expect(
      screen.getByRole("button", { name: /I have a question first/ }),
    ).toBeInTheDocument();
  });

  it("uses no gendered pronoun anywhere, for any child", () => {
    // This screen was written from the Amara frame and carried "she"/"her"
    // seven times - on the first page a parent ever sees, about their own
    // child. The payload carries a NAME and no pronoun, so the copy uses the
    // name where it reads naturally and "they" everywhere else.
    const { container } = render(<ParentConsent token={TOKEN} invitation={inv()} />);
    // Word boundaries are load-bearing here. Without them this matches the
    // "he" inside "the" and "they" and could never pass; written through a
    // shell they were mangled into literal backspace characters, which made
    // it match nothing and never FAIL. Verified by putting a "she" back.
    expect(container.textContent ?? "").not.toMatch(/\b(she|her|hers|him|his)\b/i);
  });

  it("stays pronoun-free on the three promises when opened out", () => {
    const { container } = render(<ParentConsent token={TOKEN} invitation={inv()} />);
    // The three promises are the densest copy on the page and where the
    // pronouns were thickest.
    expect(container.textContent).toMatch(/at their own pace/);
    expect(container.textContent).toMatch(/how they[’']re getting on/);
    expect(container.textContent).toMatch(/Amara[’']s progress is always saved/);
  });

  it("capitalises a nameless student's stand-in at the head of the heading", () => {
    // The API sends the literal string "your child" when no first name exists.
    render(
      <ParentConsent token={TOKEN} invitation={inv({ studentFirstName: "your child" })} />,
    );

    expect(
      screen.getByRole("heading", { name: /^Your child[’']s school would like/ }),
    ).toBeInTheDocument();
  });
});

describe("giving consent", () => {
  /*
   * THIS USED TO ASSERT "the token, which is the whole request" — and on
   * 21 Sep it stopped being the whole request. `CompleteParentConsentRequest`
   * made `grantedTypes` REQUIRED, so the call 422'd and no consent was
   * recorded for anyone. `npm run contract` caught it; this test did not,
   * because it pinned the shape we were sending rather than the shape the
   * endpoint wanted.
   */
  it("sends the token AND the invitation's own consent types", async () => {
    render(<ParentConsent token={TOKEN} invitation={inv()} />);
    fireEvent.click(screen.getByRole("button", { name: /Yes, I give my consent/ }));

    expect(completeConsent).toHaveBeenCalledWith(TOKEN, ["data_processing"]);
    expect(await screen.findByText(/that[’']s all we needed/i)).toBeInTheDocument();
  });

  it("never grants a type the invitation did not ask about", async () => {
    // The grant comes from the invitation, never composed here. Widening it
    // would record a consent the parent was never shown — and the contract
    // now says each type is "asked and answered on its own", with
    // cross-border transfer named as the reason why.
    render(<ParentConsent token={TOKEN} invitation={inv()} />);
    fireEvent.click(screen.getByRole("button", { name: /Yes, I give my consent/ }));

    const sent = completeConsent.mock.calls[0][1] as string[];
    expect(sent).toEqual(["data_processing"]);
    expect(sent).not.toContain("cross_border_transfer");
  });

  it("never reports success on a failure", async () => {
    // The assertion this file exists for. A parent must not be told consent was
    // recorded when nothing left the browser - the school would then believe it
    // has a consent it does not have.
    completeConsent.mockRejectedValueOnce(new Error("network"));
    render(<ParentConsent token={TOKEN} invitation={inv()} />);

    fireEvent.click(screen.getByRole("button", { name: /Yes, I give my consent/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn’t record/i);
    expect(screen.queryByText(/that’s all we needed/i)).not.toBeInTheDocument();
  });

  it("treats a dead link as the end of the road, not a retry", async () => {
    completeConsent.mockRejectedValueOnce(new ApiError(404, "gone"));
    render(<ParentConsent token={TOKEN} invitation={inv()} />);

    fireEvent.click(screen.getByRole("button", { name: /Yes, I give my consent/ }));

    expect(await screen.findByText(/no longer active/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Yes, I give my consent/ }),
    ).not.toBeInTheDocument();
  });
});

describe("the receipt line", () => {
  // This line was WITHHELD until 10 Sep, because nothing sent a copy and the
  // frame's "a copy has been sent to your phone" would have been a lie. It is
  // rendered now, but only from `receiptSentTo` - never assumed.

  async function consentWith(receipt: "email" | "sms" | null) {
    completeConsent.mockResolvedValue({
      invitationId: "inv-1",
      parentLinkId: "pl-1",
      parentId: "p-1",
      studentId: "s-1",
      confirmedTypes: ["data_processing"],
      completedAt: "2026-09-10T10:00:00Z",
      receiptSentTo: receipt,
    });
    render(<ParentConsent token={TOKEN} invitation={inv()} />);
    fireEvent.click(screen.getByRole("button", { name: /Yes, I give my consent/ }));
    await screen.findByText(/that[’']s all we needed/i);
  }

  /*
   * THESE TWO USED TO ASSERT THE CHANNEL - "sent to your phone" for `sms`,
   * "sent to your email" for `email`. SCRUM-162 (20 Sep) makes parent contact
   * email only, so the screen no longer names a channel at all.
   *
   * It does NOT simply hard-code "email", which was the obvious move and the
   * wrong one: the deployed `ParentContactMethod` is still `email | sms` and
   * the backend half has not landed, so an invitation created before the
   * ruling can still arrive declaring SMS. Telling that parent their copy went
   * to their email would be a lie, on the one page whose entire job is to be
   * trustworthy. Method-neutral is true under both.
   */
  /*
   * Scoped to the receipt line itself, not the whole screen. `AccountSetup`
   * legitimately labels its contact field "Your email address" on the email
   * path — that is the field the parent is looking at, not a claim about where
   * a receipt went. An earlier draft asserted across the document and failed
   * on that label, which would have been the wrong thing to "fix" in the code.
   */
  const receiptLine = () =>
    screen.getByText(/copy of your consent has been sent/i);

  it("confirms a copy was sent without naming a channel - sms record", async () => {
    await consentWith("sms");
    expect(receiptLine()).toHaveTextContent(
      /copy of your consent has been sent to you\./i,
    );
    expect(receiptLine()).not.toHaveTextContent(/your phone|your email/i);
  });

  it("confirms a copy was sent without naming a channel - email record", async () => {
    await consentWith("email");
    expect(receiptLine()).toHaveTextContent(
      /copy of your consent has been sent to you\./i,
    );
    expect(receiptLine()).not.toHaveTextContent(/your phone|your email/i);
  });

  it("says NOTHING when no copy was sent", async () => {
    // The whole reason the field exists. Claiming a receipt a parent does not
    // have is the small untruth this page cannot afford.
    await consentWith(null);
    expect(screen.queryByText(/copy of your consent/i)).not.toBeInTheDocument();
  });
});

describe("setting up a parent account", () => {
  it("offers the account straight after consent, and a way past it", async () => {
    // The primary is "Continue" now, not "Set up my parent account": D01b's
    // success copy already says what this is for, and D02 - which this is -
    // opens on confirming the contact rather than on a second invitation.
    render(<ParentConsent token={TOKEN} invitation={inv()} />);
    fireEvent.click(screen.getByRole("button", { name: /Yes, I give my consent/ }));
    await screen.findByText(/that[’']s all we needed/i);

    expect(screen.getByRole("button", { name: /^Continue$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Maybe later/i })).toBeInTheDocument();
    // Setting up must never look compulsory - consent is already recorded.
    expect(screen.queryByText(/must|required/i)).not.toBeInTheDocument();
  });

  /*
   * D02, the code flow. These replaced a set of password tests wholesale on
   * 11 Sep: `POST /consents/parent/{token}/account` and
   * `POST /auth/login/parent` were removed - "gone, not deprecated" - and
   * nothing on the parent path takes a password now. The `sms-only` state
   * those tests pinned is gone too, because a code reaches an SMS-first parent
   * exactly as well as an email one, which is the whole reason for the change.
   */

  const reachCodeStep = async () => {
    render(<ParentConsent token={TOKEN} invitation={inv()} />);
    fireEvent.click(screen.getByRole("button", { name: /Yes, I give my consent/ }));
    await screen.findByText(/that[’']s all we needed/i);
    fireEvent.click(screen.getByRole("button", { name: /^Continue$/ }));
    return screen.findByLabelText("Digit 1 of 4");
  };

  const typeCode = (code: string) => {
    [...code].forEach((d, i) => {
      fireEvent.change(screen.getByLabelText(`Digit ${i + 1} of 4`), {
        target: { value: d },
      });
    });
  };

  it("sends the code to the school's contact, bound to the consent token", async () => {
    // The token is what stops a link holder redirecting the code somewhere of
    // their choosing. Dropping it would still "work", which is exactly why it
    // is asserted rather than assumed.
    await reachCodeStep();

    expect(requestCode).toHaveBeenCalledWith("ada.okoro@example.com", TOKEN);
  });

  it("never offers the contact as an editable field", async () => {
    // D02 draws it editable. It cannot be, on this path: backend binds the code
    // to the contact the school entered. Shown, not offered.
    render(<ParentConsent token={TOKEN} invitation={inv()} />);
    fireEvent.click(screen.getByRole("button", { name: /Yes, I give my consent/ }));
    await screen.findByText(/that[’']s all we needed/i);

    expect(screen.getByText("ada.okoro@example.com")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("says phone, not email, for an SMS-first parent", async () => {
    // `ParentContactMethod` is email | sms and Nigeria is SMS-first. D02's
    // copy is email-only; following the method the school recorded is ours.
    render(
      <ParentConsent
        token={TOKEN}
        invitation={inv({
          parentContact: "+2348012345678",
          parentContactMethod: "sms",
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Yes, I give my consent/ }));
    await screen.findByText(/that[’']s all we needed/i);

    expect(screen.getByText("Your phone number")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Continue$/ }));
    expect(await screen.findByText("Check your phone.")).toBeInTheDocument();
    expect(screen.queryByText("Check your email.")).not.toBeInTheDocument();
  });

  it("will not verify until all four digits are in", async () => {
    await reachCodeStep();
    typeCode("12");

    expect(screen.getByRole("button", { name: /Verify and sign in/i })).toBeDisabled();
    expect(verifyCode).not.toHaveBeenCalled();
  });

  it("exchanges the code for a session", async () => {
    verifyCode.mockResolvedValueOnce({
      accessToken: "parent-tok",
      tokenType: "bearer",
      expiresAt: "2026-12-01T00:00:00Z",
      userId: "p-1",
      role: "parent_guardian",
      replacedSession: false,
    });
    await reachCodeStep();
    typeCode("1234");
    fireEvent.click(screen.getByRole("button", { name: /Verify and sign in/i }));

    expect(verifyCode).toHaveBeenCalledWith("ada.okoro@example.com", "1234");
    await vi.waitFor(() =>
      expect(setSession).toHaveBeenCalledWith({
        token: "parent-tok",
        expiresAt: "2026-12-01T00:00:00Z",
        userId: "p-1",
        role: "parent_guardian",
      }),
    );
  });

  it("gives one message for a wrong code and an expired one", async () => {
    // The contract has ONE failure code for both, deliberately: "expired"
    // confirms a code was issued, which confirms the address is known. The UI
    // must not reintroduce the distinction the API refused to make.
    verifyCode.mockRejectedValueOnce(
      new ApiError(401, "unauthorized", { detail: { code: "code_invalid" } }),
    );
    await reachCodeStep();
    typeCode("1234");
    fireEvent.click(screen.getByRole("button", { name: /Verify and sign in/i }));

    // The property is that ONE message covers BOTH cases - so it must name
    // both. A message saying only "wrong", or only "expired", would be the
    // distinction the contract deliberately refuses to draw.
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/wrong/i);
    expect(alert).toHaveTextContent(/expired/i);
    expect(setSession).not.toHaveBeenCalled();
  });

  it("clears the boxes after a wrong code so the next try starts clean", async () => {
    verifyCode.mockRejectedValueOnce(
      new ApiError(401, "unauthorized", { detail: { code: "code_invalid" } }),
    );
    await reachCodeStep();
    typeCode("1234");
    fireEvent.click(screen.getByRole("button", { name: /Verify and sign in/i }));
    await screen.findByRole("alert");

    expect(screen.getByLabelText("Digit 1 of 4")).toHaveValue("");
  });

  it("says a resent code retires the one before it", async () => {
    // A parent looking at two messages has to know which one still works.
    await reachCodeStep();
    fireEvent.click(screen.getByRole("button", { name: /Resend code/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no longer works/i,
    );
    expect(requestCode).toHaveBeenCalledTimes(2);
  });

  it("never reports a failed send as an unknown contact", async () => {
    // `request-code` answers 202 whether or not it knows the address, so there
    // is no signal that could justify "we don't recognise that" - and inventing
    // one would leak exactly what the 202 exists to hide.
    requestCode.mockRejectedValueOnce(new ApiError(500, "boom", {}));
    render(<ParentConsent token={TOKEN} invitation={inv()} />);
    fireEvent.click(screen.getByRole("button", { name: /Yes, I give my consent/ }));
    await screen.findByText(/that[’']s all we needed/i);
    fireEvent.click(screen.getByRole("button", { name: /^Continue$/ }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn’t send that code/i);
    expect(alert).not.toHaveTextContent(/recognis|not found|no account/i);
  });

  it("never stores a session when verification fails", async () => {
    verifyCode.mockRejectedValueOnce(new ApiError(500, "boom", {}));
    await reachCodeStep();
    typeCode("1234");
    fireEvent.click(screen.getByRole("button", { name: /Verify and sign in/i }));

    await screen.findByRole("alert");
    expect(setSession).not.toHaveBeenCalled();
  });

  it("lets a parent decline without losing the consent they just gave", async () => {
    render(<ParentConsent token={TOKEN} invitation={inv()} />);
    fireEvent.click(screen.getByRole("button", { name: /Yes, I give my consent/ }));
    await screen.findByText(/that[’']s all we needed/i);

    fireEvent.click(screen.getByRole("button", { name: /Maybe later/i }));

    expect(screen.getByText(/All done/i)).toBeInTheDocument();
    expect(screen.getByText(/set up an account later from the same link/i)).toBeInTheDocument();
    expect(requestCode).not.toHaveBeenCalled();
  });
});

describe("having a question first", () => {
  it("shows the school's own phone and email when it has them", () => {
    render(
      <ParentConsent
        token={TOKEN}
        invitation={inv({
          schoolPhone: "+234 1 271 0044",
          schoolEmail: "office@coronaschools.edu.ng",
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /I have a question first/ }));

    expect(screen.getByRole("link", { name: /\+234 1 271 0044/ })).toHaveAttribute(
      "href",
      "tel:+23412710044",
    );
    expect(
      screen.getByRole("link", { name: /office@coronaschools\.edu\.ng/ }),
    ).toHaveAttribute("href", "mailto:office@coronaschools.edu.ng");
  });

  it("degrades to prose when the school gave no contact details", () => {
    // Null for MOST schools today - they come from the billing contact. A
    // "reach the school directly:" heading with nothing under it is worse than
    // not offering the route.
    render(<ParentConsent token={TOKEN} invitation={inv()} />);
    fireEvent.click(screen.getByRole("button", { name: /I have a question first/ }));

    expect(screen.queryByRole("link", { name: /tel:/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Contact the school the way you normally would/i)).toBeInTheDocument();
    expect(screen.queryByText(/Reach the school directly/i)).not.toBeInTheDocument();
  });

  it("always offers Nevo's own support address as a second route", () => {
    render(<ParentConsent token={TOKEN} invitation={inv()} />);
    fireEvent.click(screen.getByRole("button", { name: /I have a question first/ }));

    expect(
      screen.getByRole("link", { name: /support@nevolearning\.com/ }),
    ).toBeInTheDocument();
  });

  it("says plainly that nothing has happened yet", () => {
    // A parent reading the question screen must not fear they have already
    // consented by tapping through.
    render(<ParentConsent token={TOKEN} invitation={inv()} />);
    fireEvent.click(screen.getByRole("button", { name: /I have a question first/ }));

    expect(screen.getByText(/consent is never assumed/i)).toBeInTheDocument();
  });

  it("goes back to the request without having sent anything", () => {
    render(<ParentConsent token={TOKEN} invitation={inv()} />);
    fireEvent.click(screen.getByRole("button", { name: /I have a question first/ }));
    fireEvent.click(screen.getByRole("button", { name: /Back to the request/ }));

    expect(completeConsent).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /Yes, I give my consent/ }),
    ).toBeInTheDocument();
  });

  it("offers two ways back, with distinct accessible names", () => {
    // Both the header arrow and the foot button return to the request. They
    // must not share a name: two controls called "Back to the request" are
    // ambiguous to anyone navigating by voice or a screen reader control list.
    render(<ParentConsent token={TOKEN} invitation={inv()} />);
    fireEvent.click(screen.getByRole("button", { name: /I have a question first/ }));

    const arrow = screen.getByRole("button", { name: "Back" });
    const foot = screen.getByRole("button", { name: "Back to the request" });
    expect(arrow).not.toBe(foot);

    fireEvent.click(arrow);
    expect(completeConsent).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /Yes, I give my consent/ }),
    ).toBeInTheDocument();
  });
});
