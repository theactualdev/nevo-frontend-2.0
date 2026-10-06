import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { confirm, push } = vi.hoisted(() => ({ confirm: vi.fn(), push: vi.fn() }));
vi.mock("@/lib/api/uploads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/uploads")>();
  return { ...actual, uploadsApi: { ...actual.uploadsApi, confirm } };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: push, prefetch: vi.fn() }),
}));

import { LiveStructureTree } from "./LiveStructureTree";
import { SystemMessagesProvider } from "@/components/shared/SystemMessages";

/**
 * C07d draws "Added to your library." once a unit goes in. The commit landed
 * on the Library with no word, which the assign wizard had already fixed for
 * the same complaint. Rendered inside the real bar, so the line is the one a
 * teacher reads.
 */

const STRUCTURE = {
  lessonId: "l-1",
  modules: [],
  lessons: [
    { lessonId: "l-1", title: "Rivers", sequenceOrder: 1, modules: [] },
    { lessonId: "l-2", title: "Deltas", sequenceOrder: 2, modules: [] },
  ],
};

beforeEach(() => {
  confirm.mockReset().mockResolvedValue({});
  push.mockReset();
});

const commit = () => {
  render(
    <SystemMessagesProvider>
      <LiveStructureTree uploadId="u-1" structure={STRUCTURE as never} blockName="Water" />
    </SystemMessagesProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /Looks right - add to my library/ }));
  fireEvent.click(screen.getByRole("button", { name: "Yes, add them" }));
};

describe("adding a unit to the library", () => {
  it("says it was added, then goes to the library", async () => {
    commit();

    expect(await screen.findByText("Added to your library.")).toBeInTheDocument();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/teacher/lessons"));
  });

  it("says nothing of the kind when the commit failed", async () => {
    confirm.mockRejectedValue(new Error("network"));
    commit();

    expect(await screen.findByText(/couldn.t add that to your library/)).toBeInTheDocument();
    expect(screen.queryByText("Added to your library.")).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
