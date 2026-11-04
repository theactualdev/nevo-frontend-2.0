import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({ status: vi.fn() }));
vi.mock("@/lib/api/uploads", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/uploads")>()),
  uploadsApi: { status: h.status },
}));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));
vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  getSession: () => ({ userId: "t-1", token: "tok", role: "teacher", expiresAt: "2030-01-01T00:00:00Z" }),
}));

import { UploadMarker } from "./UploadMarker";
import { followUpload, followedUploads } from "@/lib/uploads/followedUploads";
import { ApiError } from "@/lib/api/client";

/**
 * C07j LU-03: the upload follows the teacher in the corner, from what the
 * SERVER says about each one by its own id. It never says "Ready to assign"
 * for an upload still waiting for the teacher's check.
 */

const follow = (uploadId: string, name = "Quadratic Graphs.pdf") =>
  followUpload("t-1", { uploadId, name, scope: "single", startedAt: "2026-11-04T10:00:00Z" });

beforeEach(() => {
  window.localStorage.clear();
  h.status.mockReset();
});

describe("the upload marker", () => {
  it("draws nothing when this teacher has nothing running here", () => {
    const { container } = render(<UploadMarker />);

    expect(container).toBeEmptyDOMElement();
    expect(h.status).not.toHaveBeenCalled();
  });

  it("names the file and the server's stage, and taps back to it", async () => {
    follow("u-1");
    h.status.mockResolvedValue({ id: "u-1", status: "processing", stage: "structure" });
    render(<UploadMarker />);

    expect(await screen.findByText("Finding the sections")).toBeInTheDocument();
    expect(screen.getByText("Quadratic Graphs.pdf")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/teacher/lessons/upload?upload=u-1");
    expect(h.status).toHaveBeenCalledWith("u-1");
  });

  it("says it waits for their check - never Ready to assign - before confirm", async () => {
    follow("u-1");
    h.status.mockResolvedValue({ id: "u-1", status: "ready", stage: "complete" });
    render(<UploadMarker />);

    expect(await screen.findByText("Ready for your check")).toBeInTheDocument();
    expect(screen.queryByText(/Ready to assign/)).not.toBeInTheDocument();
    expect(screen.getByText("Tap to view")).toBeInTheDocument();
  });

  it("says when the reading stopped", async () => {
    follow("u-1");
    h.status.mockResolvedValue({ id: "u-1", status: "failed", stage: "lessons" });
    render(<UploadMarker />);

    expect(await screen.findByText("We couldn’t finish reading this one")).toBeInTheDocument();
  });

  it("lets go of one the server says is confirmed, or no longer has", async () => {
    follow("u-1");
    follow("u-2", "Other.pdf");
    h.status.mockImplementation(async (id: string) => {
      if (id === "u-1") return { id, status: "confirmed", stage: "complete" };
      throw new ApiError(404, "x", {});
    });
    const { container } = render(<UploadMarker />);

    await waitFor(() => expect(followedUploads("t-1")).toEqual([]));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
