import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ChildConsents, ParentChild } from "@/lib/api/parent";

const { myChildren, myConsents, myWithdraw, myObjection, myDataRequest, exerciseRight, search } =
  vi.hoisted(() => ({
    myChildren: vi.fn(),
    myConsents: vi.fn(),
    myWithdraw: vi.fn(),
    myObjection: vi.fn(),
    myDataRequest: vi.fn(),
    exerciseRight: vi.fn(),
    search: { value: "" },
  }));

// Replaced wholesale - see ParentDataManagement.test.tsx for why importOriginal
// deadlocks the jsdom worker here.
vi.mock("@/lib/api/parent", () => ({
  parentApi: { myChildren, myConsents, myWithdraw, myObjection, myDataRequest, exerciseRight },
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search.value),
}));

import { ParentMyData, subjectFor } from "./ParentMyData";

/**
 * D01c for a SIGNED-IN parent (Lydia, L6, 14 Oct).
 *
 * The page is the tokenised link's, word for word. What these tests hold is
 * that its three rights go to the signed-in parent's OWN routes, for the child
 * the home linked to - never to a token, which a signed-in parent has none of.
 */

const AMARA: ParentChild = {
  studentId: "s-1",
  firstName: "Amara",
  lastName: "Okafor",
  status: "active",
  schoolId: "sc-1",
  schoolName: "Corona Secondary School",
};
const TUNDE: ParentChild = { ...AMARA, studentId: "s-2", firstName: "Tunde" };

const consents = (studentId: string, over: Partial<ChildConsents["consents"][number]> = {}): ChildConsents => ({
  studentId,
  studentFirstName: null,
  consents: [
    { consentType: "data_processing", status: "confirmed", decidedAt: "2026-09-01T09:00:00Z", stopsAccess: true, ...over },
  ],
});

const outcome = (studentId: string) => ({
  requestId: "req-9",
  requestType: "object" as const,
  studentId,
  effect: "recorded",
  recordedAt: "2026-10-14T10:00:00Z",
});

beforeEach(() => {
  for (const f of [myChildren, myConsents, myWithdraw, myObjection, myDataRequest, exerciseRight]) f.mockReset();
  search.value = "";
  myChildren.mockResolvedValue([AMARA, TUNDE]);
  myConsents.mockResolvedValue([consents("s-1"), consents("s-2")]);
  myWithdraw.mockImplementation(async (id: string) => outcome(id));
  myObjection.mockImplementation(async (id: string) => outcome(id));
  myDataRequest.mockImplementation(async (id: string) => outcome(id));
});

describe("which child", () => {
  it("is the one the home linked to", async () => {
    search.value = "child=s-2";
    render(<ParentMyData />);
    expect(await screen.findByText(/Tunde[’']s data on Nevo/i)).toBeInTheDocument();
  });

  it("is the first linked child when the link names none", async () => {
    render(<ParentMyData />);
    expect(await screen.findByText(/Amara[’']s data on Nevo/i)).toBeInTheDocument();
  });

  it("says so plainly when the account is linked to no child", async () => {
    myChildren.mockResolvedValue([]);
    render(<ParentMyData />);
    expect(await screen.findByText(/isn’t linked to a child yet/i)).toBeInTheDocument();
  });

  it("never dresses a failed read as a page of rights", async () => {
    myConsents.mockRejectedValue(new Error("down"));
    render(<ParentMyData />);
    expect(await screen.findByText(/couldn’t load this just now/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Object to processing/i })).not.toBeInTheDocument();
  });
});

describe("the rights go to the signed-in routes", () => {
  it("objects for this child, with the parent's words", async () => {
    search.value = "child=s-2";
    render(<ParentMyData />);
    await screen.findByText(/Tunde[’']s data on Nevo/i);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  Too much screen time  " } });
    fireEvent.click(screen.getByRole("button", { name: /Object to processing/i }));

    expect(await screen.findByText(/within 48 hours/i)).toBeInTheDocument();
    expect(myObjection).toHaveBeenCalledWith("s-2", "Too much screen time");
    expect(exerciseRight).not.toHaveBeenCalled();
  });

  it("asks for this child's data", async () => {
    render(<ParentMyData />);
    fireEvent.click(await screen.findByRole("button", { name: /Request Amara[’']s data/i }));

    expect(await screen.findByText(/Request submitted/i)).toBeInTheDocument();
    expect(myDataRequest).toHaveBeenCalledWith("s-1");
  });

  it("withdraws only after confirming, then shows the suspended state", async () => {
    render(<ParentMyData />);
    fireEvent.click(await screen.findByRole("button", { name: /^Withdraw consent$/i }));
    expect(myWithdraw).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole("button", { name: /Withdraw consent/i }).at(-1)!);
    expect(await screen.findByText(/account is suspended/i)).toBeInTheDocument();
    expect(myWithdraw).toHaveBeenCalledWith("s-1", undefined);
  });
});

describe("subjectFor", () => {
  it("arrives suspended when a withdrawn consent stopped access", () => {
    const s = subjectFor(
      AMARA,
      consents("s-1", { status: "withdrawn", decidedAt: "2026-10-01T09:00:00Z" }),
    );
    expect(s.status).toBe("withdrawn");
    expect(s.decidedAt).toBe("2026-10-01T09:00:00Z");
  });

  it("stays active when the withdrawn consent does not stop access", () => {
    const s = subjectFor(AMARA, consents("s-1", { status: "withdrawn", stopsAccess: false }));
    expect(s.status).toBe("confirmed");
  });

  it("names no parent, because there is no link to forward", () => {
    expect(subjectFor(AMARA, null).parentName).toBeNull();
  });
});
