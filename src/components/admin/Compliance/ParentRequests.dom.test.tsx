import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ApiError } from "@/lib/api/client";
import type { ParentRightLog, ParentRightLogRow } from "@/lib/api/consents";
import { ParentRequests, requestCategory } from "./ParentRequests";

/**
 * The parent rights log on Compliance. D22b's rule is the one that matters:
 * a category, a date and a status - never a child's or a parent's name, even
 * though the log sends both.
 */

const rightsLog = vi.fn<(o: { limit?: number; offset?: number }) => Promise<ParentRightLog>>();

vi.mock("@/lib/api/consents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/consents")>();
  return {
    ...actual,
    consentsApi: { ...actual.consentsApi, rightsLog: (o: { limit?: number; offset?: number }) => rightsLog(o) },
  };
});

const row = (over: Partial<ParentRightLogRow>): ParentRightLogRow => ({
  id: over.id ?? "r1",
  studentId: "s1",
  studentName: "Amara Okafor",
  parentId: "p1",
  parentName: "Ngozi Okafor",
  requestType: "request_data",
  reasonRecorded: true,
  status: "open",
  createdAt: "2026-09-05T10:00:00Z",
  resolvedAt: null,
  ...over,
});

const page = (entries: ParentRightLogRow[], total = entries.length, offset = 0): ParentRightLog => ({
  entries,
  total,
  limit: 20,
  offset,
});

beforeEach(() => {
  rightsLog.mockReset();
});

describe("Requests from parents", () => {
  it("shows a category, a date and a status - and no names", async () => {
    rightsLog.mockResolvedValue(
      page([
        row({ id: "a", requestType: "request_data" }),
        row({ id: "b", requestType: "withdraw_consent", createdAt: "2026-09-01T10:00:00Z", resolvedAt: "2026-09-03T10:00:00Z" }),
        row({ id: "c", requestType: "object", createdAt: "2026-08-24T10:00:00Z" }),
      ]),
    );
    const { container } = render(<ParentRequests />);
    await waitFor(() => expect(visibleText(container)).toMatch(/Data subject request/));
    const text = visibleText(container);
    expect(text).toMatch(/Consent withdrawal/);
    expect(text).toMatch(/Objection to processing/);
    expect(text).toMatch(/5 September 2026/);
    expect(text).toMatch(/3\s*requests/);
    expect(screen.getAllByText("Pending")).toHaveLength(2);
    expect(screen.getAllByText("Resolved")).toHaveLength(1);
    // The log sends both names. Neither reaches the screen.
    expect(text).not.toMatch(/Amara|Okafor|Ngozi/);
    expect(text).toMatch(/category and status only, by design/);
  });

  it("says plainly when nothing has been asked", async () => {
    rightsLog.mockResolvedValue(page([]));
    const { container } = render(<ParentRequests />);
    await waitFor(() => expect(visibleText(container)).toMatch(/No requests from parents\./));
  });

  it("loads older requests a page at a time", async () => {
    rightsLog.mockResolvedValueOnce(page([row({ id: "a" })], 2));
    rightsLog.mockResolvedValueOnce(page([row({ id: "b", requestType: "object" })], 2, 1));
    const { container } = render(<ParentRequests />);
    fireEvent.click(await screen.findByRole("button", { name: "Show older requests" }));
    await waitFor(() => expect(visibleText(container)).toMatch(/Objection to processing/));
    expect(rightsLog).toHaveBeenLastCalledWith({ limit: 20, offset: 1 });
    expect(screen.queryByRole("button", { name: "Show older requests" })).toBeNull();
  });

  it("offers a retry when the log can't be read", async () => {
    rightsLog.mockRejectedValue(new Error("down"));
    const { container } = render(<ParentRequests />);
    await waitFor(() => expect(visibleText(container)).toMatch(/the requests parents have made/));
  });

  it("shows nothing to an admin who may not read it", async () => {
    rightsLog.mockRejectedValue(new ApiError(403, "Forbidden"));
    const { container } = render(<ParentRequests />);
    await waitFor(() => expect(rightsLog).toHaveBeenCalled());
    await waitFor(() => expect(visibleText(container)).not.toMatch(/Requests from parents/));
  });

  it("names an unknown request type generically rather than leaving it blank", () => {
    expect(requestCategory("erasure")).toBe("Request from a parent");
  });
});
