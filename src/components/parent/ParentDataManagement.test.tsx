import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";
import type { ParentInvitation } from "@/lib/api/parent";

const { exerciseRight } = vi.hoisted(() => ({ exerciseRight: vi.fn() }));

// Replaced wholesale rather than spread over `importOriginal`. Pulling the
// real module in here hangs the jsdom worker for 60s - `parent.ts` imports
// `client.ts`, which this file also imports for `ApiError`, and resolving both
// at once deadlocks. The module exports one object and types, so there is
// nothing to preserve.
vi.mock("@/lib/api/parent", () => ({ parentApi: { exerciseRight } }));

import { ParentDataManagement } from "./ParentDataManagement";

/**
 * The parent data-rights page (SCRUM-80, D01c).
 *
 * Tested more carefully than a screen of its size would normally warrant,
 * because the thing it does is statutory. NDPA 2023 s.31 requires a parent to
 * have a direct route to review, object and withdraw; if a button here says a
 * right was exercised and no request left the browser, Nevo has told a parent
 * something untrue about their child on a page whose entire purpose is to be
 * trustworthy.
 *
 * So the assertions are mostly about the WIRE: that the right value goes out,
 * that a failure is never dressed as a success, and that withdrawal - the one
 * irreversible action - cannot happen on a single tap.
 *
 * The invitation is a PROP now, read once by `ParentPortal`, so the tests that
 * used to cover fetching (loading, unknown token) live in that file instead.
 */

const TOKEN = "parent-token-abc";

const INVITATION: ParentInvitation = {
  invitationId: "inv-1",
  studentFirstName: "Amara",
  schoolName: "Brightgate Academy",
  schoolPhone: null,
  schoolEmail: null,
  parentName: "Ngozi Okafor",
  parentContact: "ada.okoro@example.com",
  parentContactMethod: "email",
  status: "confirmed",
  consentTypes: ["data_processing"],
  expiresAt: "2026-12-01T00:00:00Z",
  decidedAt: null,
};

const inv = (over: Partial<ParentInvitation> = {}): ParentInvitation => ({
  ...INVITATION,
  ...over,
});

const receipt = (over: Partial<{ reasonRecorded: boolean }> = {}) => ({
  requestId: "req-1",
  requestType: "object" as const,
  status: "received",
  reasonRecorded: false,
  ...over,
});

beforeEach(() => {
  exerciseRight.mockReset();
  exerciseRight.mockResolvedValue(receipt());
});

describe("what the page names", () => {
  it("names the child and the school", () => {
    render(<ParentDataManagement token={TOKEN} invitation={inv()} />);

    expect(screen.getByText(/Amara[’']s data on Nevo/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Brightgate Academy enrolled Amara/i),
    ).toBeInTheDocument();
  });
});

describe("a parent who already withdrew", () => {
  it("arrives at the suspended state, not the actions", () => {
    // The failure this fixes: with no way to read the token, a parent who
    // withdrew last week was shown the withdrawal buttons again.
    render(
      <ParentDataManagement token={TOKEN} invitation={inv({ status: "withdrawn" })} />,
    );

    expect(screen.getByText(/Amara[’']s account is suspended/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Withdraw consent$/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps the right to a data copy after withdrawal", () => {
    // Correct in law: the right of access survives withdrawal of consent, and
    // the frame says so in as many words.
    render(
      <ParentDataManagement token={TOKEN} invitation={inv({ status: "withdrawn" })} />,
    );

    expect(
      screen.getByText(/keep this right even after withdrawing/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Request Amara[’']s data/i }),
    ).toBeInTheDocument();
  });
});

describe("a student the school never named", () => {
  // NOT hypothetical. The backend sends the LITERAL string "your child" when a
  // school entered no first name, and confirmed there is such a student in the
  // data. The field is always present, so the literal flows into whatever
  // sentence it lands in - including the head of a heading.
  const NAMELESS = inv({ studentFirstName: "your child" });

  it("capitalises the name where it opens a heading", () => {
    render(<ParentDataManagement token={TOKEN} invitation={NAMELESS} />);

    expect(
      screen.getByRole("heading", { name: /^Your child[’']s data on Nevo$/ }),
    ).toBeInTheDocument();
  });

  it("capitalises it on the suspended heading too", () => {
    render(
      <ParentDataManagement
        token={TOKEN}
        invitation={inv({ studentFirstName: "your child", status: "withdrawn" })}
      />,
    );

    expect(
      screen.getByRole("heading", { name: /^Your child[’']s account is suspended$/ }),
    ).toBeInTheDocument();
  });

  it("leaves it lowercase mid-sentence, where capitals would be wrong", () => {
    render(<ParentDataManagement token={TOKEN} invitation={NAMELESS} />);

    expect(screen.getByText(/enrolled your child on Nevo/)).toBeInTheDocument();
  });

  it("does not mangle a real name", () => {
    render(<ParentDataManagement token={TOKEN} invitation={inv()} />);
    expect(screen.getByText(/Amara[’']s data on Nevo/)).toBeInTheDocument();
  });
});

describe("when the withdrawal happened", () => {
  it("says the date, rather than only that it happened", () => {
    render(
      <ParentDataManagement
        token={TOKEN}
        invitation={inv({ status: "withdrawn", decidedAt: "2026-09-03T10:15:00Z" })}
      />,
    );

    expect(
      screen.getByText(
        /You withdrew consent on 3 September 2026, so they can no longer access Nevo\./,
      ),
    ).toBeInTheDocument();
  });

  it("keeps the comma attached when there is no date", () => {
    render(
      <ParentDataManagement
        token={TOKEN}
        invitation={inv({ status: "withdrawn", decidedAt: null })}
      />,
    );

    expect(
      screen.getByText(/^You withdrew consent, so they can no longer access Nevo\.$/),
    ).toBeInTheDocument();
  });

  it("renders no date rather than 'Invalid Date' on a bad value", () => {
    // The real trap: `decidedAt` truthy but unparseable makes the formatter
    // return "", which used to emit "You withdrew consent on , so ...".
    render(
      <ParentDataManagement
        token={TOKEN}
        invitation={inv({ status: "withdrawn", decidedAt: "not-a-date" })}
      />,
    );

    expect(screen.getByText(/^You withdrew consent, so/)).toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date/)).not.toBeInTheDocument();
  });
});

describe("who the link is for", () => {
  it("names the parent the school recorded, because a link can be forwarded", () => {
    render(<ParentDataManagement token={TOKEN} invitation={inv()} />);
    expect(screen.getByText(/This link was sent to Ngozi Okafor\./)).toBeInTheDocument();
  });
});

describe("objecting", () => {
  it("offers a box for the concern, now that something receives it", () => {
    // The textarea was deliberately withheld while `reason` was accepted and
    // dropped; it returns now that the contract persists it and confirms with
    // `reasonRecorded`.
    render(<ParentDataManagement token={TOKEN} invitation={inv()} />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("sends the parent's words with the objection", async () => {
    exerciseRight.mockResolvedValue(receipt({ reasonRecorded: true }));
    render(<ParentDataManagement token={TOKEN} invitation={inv()} />);

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "  I did not agree to profiling.  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /Object to processing/i }));

    expect(exerciseRight).toHaveBeenCalledWith(
      TOKEN,
      "object",
      "  I did not agree to profiling.  ",
    );
    expect(await screen.findByText(/within 48 hours/i)).toBeInTheDocument();
  });

  it("admits it when the reason was NOT recorded", async () => {
    // The contract answers "did my words go anywhere". If it says no, say so -
    // promising a recorded concern that was dropped is the exact failure the
    // textarea was withheld for in the first place.
    exerciseRight.mockResolvedValue(receipt({ reasonRecorded: false }));
    render(<ParentDataManagement token={TOKEN} invitation={inv()} />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "a concern" } });
    fireEvent.click(screen.getByRole("button", { name: /Object to processing/i }));

    expect(await screen.findByText(/could not attach your note/i)).toBeInTheDocument();
  });

  it("does not claim a note failed when none was written", async () => {
    exerciseRight.mockResolvedValue(receipt({ reasonRecorded: false }));
    render(<ParentDataManagement token={TOKEN} invitation={inv()} />);

    fireEvent.click(screen.getByRole("button", { name: /Object to processing/i }));

    expect(await screen.findByText(/within 48 hours/i)).toBeInTheDocument();
    expect(screen.queryByText(/could not attach your note/i)).not.toBeInTheDocument();
  });
});

describe("withdrawing consent", () => {
  it("cannot be done in one tap", () => {
    // The one irreversible action on the page, and restoring access needs the
    // school. It must not be reachable by a mis-tap.
    render(<ParentDataManagement token={TOKEN} invitation={inv()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Withdraw consent$/i }));

    expect(exerciseRight).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Keep active/i })).toBeInTheDocument();
  });

  it("sends withdraw_consent only after confirming", async () => {
    render(<ParentDataManagement token={TOKEN} invitation={inv()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Withdraw consent$/i }));
    fireEvent.click(
      screen.getAllByRole("button", { name: /Withdraw consent/i }).at(-1)!,
    );

    expect(exerciseRight).toHaveBeenCalledWith(TOKEN, "withdraw_consent", undefined);
    expect(await screen.findByText(/account is suspended/i)).toBeInTheDocument();
  });
});

describe("when the request does not land", () => {
  it("never reports success on a failure", async () => {
    // The assertion this file exists for. A parent must not be told their
    // objection was received when nothing left the browser.
    exerciseRight.mockRejectedValueOnce(new Error("network"));
    render(<ParentDataManagement token={TOKEN} invitation={inv()} />);

    fireEvent.click(screen.getByRole("button", { name: /Object to processing/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn’t send/i);
    expect(screen.queryByText(/Objection submitted/i)).not.toBeInTheDocument();
  });

  it("says nothing has changed, because nothing has", async () => {
    exerciseRight.mockRejectedValueOnce(new Error("network"));
    render(<ParentDataManagement token={TOKEN} invitation={inv()} />);

    fireEvent.click(screen.getByRole("button", { name: /Object to processing/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Nothing has changed/i);
  });

  it("treats a link revoked MID-SESSION as the end of the road", async () => {
    // The page opened fine, so the token was live a moment ago. It can still be
    // revoked between opening and acting, and that 404 is this screen's to
    // handle even though the initial read belongs to the portal.
    exerciseRight.mockRejectedValueOnce(new ApiError(404, "not found"));
    render(<ParentDataManagement token={TOKEN} invitation={inv()} />);

    fireEvent.click(screen.getByRole("button", { name: /Request Amara[’']s data/i }));

    expect(await screen.findByText(/no longer active/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Object/i })).not.toBeInTheDocument();
  });
});

describe("the school's own contact details", () => {
  it("are omitted entirely when the school has none", () => {
    // They come from the billing contact and are null for MOST schools today.
    // A "call your school" line with nothing after it is worse than no line.
    render(<ParentDataManagement token={TOKEN} invitation={inv()} />);

    expect(screen.queryByRole("link", { name: /Brightgate/i })).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /support@nevolearning/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ndpc\.gov\.ng/i })).toBeInTheDocument();
  });

  it("are shown when the school has them", () => {
    render(
      <ParentDataManagement
        token={TOKEN}
        invitation={inv({
          schoolPhone: "+234 801 234 5678",
          schoolEmail: "office@brightgate.edu.ng",
        })}
      />,
    );

    expect(screen.getByRole("link", { name: /\+234 801 234 5678/ })).toHaveAttribute(
      "href",
      "tel:+2348012345678",
    );
    expect(screen.getByRole("link", { name: /office@brightgate\.edu\.ng/ })).toHaveAttribute(
      "href",
      "mailto:office@brightgate.edu.ng",
    );
  });
});

describe("what the page tells a parent", () => {
  it("discloses cross-border processing without being asked", () => {
    render(<ParentDataManagement token={TOKEN} invitation={inv()} />);
    fireEvent.click(screen.getByRole("button", { name: /Where data is processed/i }));

    expect(screen.getByText(/no adequacy decision from the NDPC/i)).toBeInTheDocument();
    expect(screen.getByText(/Standard Contractual Clauses/i)).toBeInTheDocument();
  });

  it("states plainly that Nevo stores no label or diagnosis, in the child's name", () => {
    render(<ParentDataManagement token={TOKEN} invitation={inv()} />);
    fireEvent.click(screen.getByRole("button", { name: /How profiling works/i }));

    expect(screen.getByText(/never stores a label or a diagnosis/i)).toBeInTheDocument();
    expect(screen.getByText(/how Amara is learning/i)).toBeInTheDocument();
  });
});
