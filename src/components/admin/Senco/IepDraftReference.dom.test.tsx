import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ApiError } from "@/lib/api/client";
import type { AdminStudentRow } from "@/lib/api/students";
import { IepExporterView } from "./IepExporterView";

/**
 * TO-DO 11 (24 Nov): "Why does drafting a progress report in learning support
 * not work?" The draft is written by a model and safety-checked on the server;
 * when that fails, the server answers 500 with its own reference, and this
 * page used to drop it - so the one fact that could find the failure in the
 * server's log never reached the person who saw it.
 */

const create = vi.fn();
vi.mock("@/lib/api/export", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/export")>();
  return { ...actual, exportApi: { ...actual.exportApi, create: (b: unknown) => create(b) } };
});
vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return {
    ...actual,
    studentsApi: {
      ...actual.studentsApi,
      list: async (): Promise<AdminStudentRow[]> => [
        {
          id: "s1",
          name: "Amara Okafor",
          loginIdentifier: "amara1",
          status: "active",
          ageBand: "11-14",
          consent: { status: "confirmed", actorId: null, actorName: null, timestamp: null, channel: null },
        },
      ],
      parentLinks: async () => [],
    },
  };
});

/** The body the backend's catch-all handler sends (main.py, `unexpected_error`). */
const UNPLANNED = new ApiError(500, "Internal Server Error", {
  detail: {
    code: "unexpected_error",
    message: "Something went wrong at our end. Nothing you did caused it. Quote this reference if you tell us: 3f9a0c1d2e4b",
    incidentId: "3f9a0c1d2e4b",
  },
});

async function draft() {
  const view = render(<IepExporterView initialStudentId="s1" />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Generate draft" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Generate draft" }));
  await waitFor(() => expect(visibleText(view.container)).toMatch(/Something went wrong/));
  return view.container;
}

beforeEach(() => {
  create.mockReset();
});

describe("a draft the server failed to write", () => {
  it("names the server's reference for it, and nothing round it", async () => {
    create.mockRejectedValue(UNPLANNED);
    const container = await draft();

    expect(visibleText(container)).toMatch(/Reference 3f9a0c1d2e4b/);
    // The server's own sentence invites a report with no route to make it.
    expect(visibleText(container)).not.toMatch(/Quote this reference/);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ studentId: "s1" }));
  });

  it("says no reference where the server sent none - a timeout, a proxy's page", async () => {
    create.mockRejectedValue(new ApiError(503, "Service Unavailable", "<html>Application error</html>"));
    const container = await draft();

    expect(visibleText(container)).not.toMatch(/Reference/);
  });

  it("forgets the reference once a later failure carries none", async () => {
    create.mockRejectedValueOnce(UNPLANNED).mockRejectedValueOnce(new ApiError(504, "Gateway Timeout"));
    const container = await draft();
    expect(visibleText(container)).toMatch(/Reference 3f9a0c1d2e4b/);

    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Generate draft" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Generate draft" }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(visibleText(container)).toMatch(/Something went wrong/));
    expect(visibleText(container)).not.toMatch(/Reference/);
  });
});
