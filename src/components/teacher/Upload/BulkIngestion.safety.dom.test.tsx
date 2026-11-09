import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const { batch, status, list, create, getToken, confirm, push } = vi.hoisted(() => ({
  push: vi.fn(),
  confirm: vi.fn(),
  batch: vi.fn(),
  status: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  getToken: vi.fn(),
}));
vi.mock("@/lib/api/uploads", () => ({
  uploadsApi: { batch, status, list, create, confirm },
}));
vi.mock("@/lib/api/lessons", () => ({ lessonsApi: { detail: vi.fn() } }));
vi.mock("@/lib/auth/session", () => ({ getToken }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
}));

import { BulkIngestion } from "./BulkIngestion";

/**
 * A FILE IN A BATCH THAT A SAFETY CHECK STOPPED (Lydia, 9 Nov, item 6). The
 * uploads list carries `reasonCode` on each row (backend 86f8e10), and a row
 * stopped with `safety_held` says Lydia's line - never the server's sentence, no
 * reference, and no "Send this one again", which would be refused again.
 */

const LINE =
  "Nevo stopped partway through this lesson because of a safety check, so the sections it would normally propose are not here. Nothing has reached your class.";
const SERVER_HELD =
  "Our safety check held this file back, so the lesson has not been prepared. If the material is ordinary classroom content, tell us the reference below and we will look at the check rather than your file.";
const SERVER_UNAVAILABLE =
  "Our safety check could not run, so the lesson has not been prepared. Nothing is wrong with your file - please try again shortly.";

const ONE_ACCEPTED = {
  acceptedCount: 1,
  rejectedCount: 0,
  uploads: [
    {
      uploadId: "u-1",
      filename: "unit-0.pdf",
      accepted: true,
      error: null,
      status: "processing",
      stage: "lessons",
    },
  ],
};

const drop = () => {
  const input = document.querySelector('input[type="file"]');
  if (!input) throw new Error("no file input");
  const files = [new File(["x"], "unit-0.pdf", { type: "application/pdf" })];
  Object.defineProperty(input, "files", { value: files, configurable: true });
  fireEvent.change(input);
};

const toResults = async () => {
  batch.mockResolvedValue(ONE_ACCEPTED);
  render(<BulkIngestion />);
  drop();
  await act(async () => {});
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
};

beforeEach(() => {
  for (const f of [batch, status, list, create, getToken]) f.mockReset();
  getToken.mockReturnValue("tok");
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("a batch file a safety check stopped", () => {
  it("says Lydia's line, and nothing beyond it", async () => {
    list.mockResolvedValue([
      {
        id: "u-1",
        status: "failed",
        reasonCode: "safety_held",
        failureReason: SERVER_HELD,
        incidentId: "ca8435c98d08",
      },
    ]);

    await toResults();

    expect(screen.getByText(LINE)).toBeInTheDocument();
    expect(screen.queryByText(SERVER_HELD)).not.toBeInTheDocument();
    expect(screen.queryByText(/ca8435c98d08/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send this one again/i })).not.toBeInTheDocument();
  });

  it("keeps the server's sentence and the resend when the check could not run", async () => {
    list.mockResolvedValue([
      {
        id: "u-1",
        status: "failed",
        reasonCode: "safety_check_unavailable",
        failureReason: SERVER_UNAVAILABLE,
      },
    ]);

    await toResults();

    expect(screen.getByText(SERVER_UNAVAILABLE)).toBeInTheDocument();
    expect(screen.queryByText(LINE)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send this one again/i })).toBeInTheDocument();
  });
});
