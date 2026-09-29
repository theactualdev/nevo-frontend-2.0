import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { AttentionFlag } from "@/lib/api/intelligence";
import { SencoView } from "./SencoView";

/**
 * Clearing the last open flag said the SENCo's whole queue was empty before the
 * server had answered.
 *
 * The flag was flipped optimistically and rolled back on failure - the usual
 * trade, and the wrong one here, because the flag disappearing is what makes
 * the card render "Nothing needs your attention right now". On a failed POST
 * the row returned, with the reassurance already read.
 */

const acknowledgeFlag = vi.fn();
const getFlags = vi.fn();
/** Whether the paged read got to the end. Most tests: yes. */
const complete = { value: true };

vi.mock("@/lib/api/intelligence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/intelligence")>();
  return {
    ...actual,
    intelligenceApi: {
      ...actual.intelligenceApi,
      allFlags: async () => ({ flags: await getFlags(), complete: complete.value }),
      acknowledgeFlag: (id: string) => acknowledgeFlag(id),
    },
  };
});

vi.mock("@/lib/api/classes", () => ({ classesApi: { list: async () => [] } }));
vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return {
    ...actual,
    studentsApi: { ...actual.studentsApi, list: async () => [] },
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const flag = (id: string): AttentionFlag => ({
  id,
  studentId: `s-${id}`,
  flagType: "pacing",
  description: `Something worth a look (${id})`,
  generatedAt: "2026-09-01T00:00:00Z",
  acknowledged: false,
});

const EMPTY = "Nothing needs your attention right now";

describe("SencoView mark as seen", () => {
  it("does not claim the queue is empty before the server answers", async () => {
    getFlags.mockResolvedValue([flag("f1")]);
    // In flight and never settling: the state the old code rendered through.
    acknowledgeFlag.mockImplementation(() => new Promise(() => {}));

    const { container } = render(<SencoView />);
    fireEvent.click(await screen.findByRole("button", { name: "Mark as seen" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Marking…" })).toBeDisabled(),
    );
    // The flag is still open, because nothing has confirmed it is not.
    expect(visibleText(container)).not.toMatch(new RegExp(EMPTY, "i"));
    expect(visibleText(container)).toMatch(/Something worth a look \(f1\)/);
  });

  it("keeps the flag and says so when the write is refused", async () => {
    getFlags.mockResolvedValue([flag("f1")]);
    acknowledgeFlag.mockRejectedValue(new Error("500"));

    const { container } = render(<SencoView />);
    fireEvent.click(await screen.findByRole("button", { name: "Mark as seen" }));

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/couldn't record that as seen/i),
    );
    expect(visibleText(container)).toMatch(/nothing has changed/i);
    expect(visibleText(container)).not.toMatch(new RegExp(EMPTY, "i"));
    // Still there, and pressable again - it never left.
    expect(
      screen.getByRole("button", { name: "Mark as seen" }),
    ).toBeInTheDocument();
  });

  it("clears the flag once the server confirms", async () => {
    getFlags.mockResolvedValue([flag("f1")]);
    acknowledgeFlag.mockResolvedValue({ ...flag("f1"), acknowledged: true });

    const { container } = render(<SencoView />);
    fireEvent.click(await screen.findByRole("button", { name: "Mark as seen" }));

    await waitFor(() =>
      expect(visibleText(container)).toMatch(new RegExp(EMPTY, "i")),
    );
    expect(visibleText(container)).not.toMatch(/couldn't record/i);
  });

  it("does not fire twice while one is in flight", async () => {
    getFlags.mockResolvedValue([flag("f1"), flag("f2")]);
    acknowledgeFlag.mockImplementation(() => new Promise(() => {}));

    render(<SencoView />);
    const buttons = await screen.findAllByRole("button", {
      name: "Mark as seen",
    });
    fireEvent.click(buttons[0]);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Marking…" })).toBeDisabled(),
    );
    // Every row's control is held, not just the one pressed - two in-flight
    // acknowledgements would race each other's `setFlags`.
    fireEvent.click(screen.getByRole("button", { name: "Mark as seen" }));
    expect(acknowledgeFlag).toHaveBeenCalledTimes(1);
  });
});

describe("SencoView reads every flag", () => {
  const seen = (id: string): AttentionFlag => ({ ...flag(id), acknowledged: true });

  it("finds open flags behind fifty seen ones", async () => {
    /*
     * This read the first 50 flags and dropped acknowledged ones on the
     * client. Fifty seen flags ahead of an open one meant the open one never
     * arrived, and the SENCo was told nothing needed attention.
     */
    complete.value = true;
    getFlags.mockResolvedValue([
      ...Array.from({ length: 60 }, (_, i) => seen(`old${i}`)),
      flag("late"),
    ]);
    const { container } = render(<SencoView />);

    await waitFor(() => expect(visibleText(container)).toMatch(/Something worth a look \(late\)/));
    expect(visibleText(container)).toMatch(/\b1 to look at/);
    expect(visibleText(container)).not.toMatch(new RegExp(EMPTY));
  });

  it("will not say nothing needs attention when it could not read every flag", async () => {
    complete.value = false;
    getFlags.mockResolvedValue([seen("a")]);
    const { container } = render(<SencoView />);

    await waitFor(() => expect(visibleText(container)).toMatch(/couldn.t read every flag/));
    expect(visibleText(container)).not.toMatch(new RegExp(EMPTY));
    complete.value = true;
  });

  it("shows a partial count as a floor, never as a total", async () => {
    complete.value = false;
    getFlags.mockResolvedValue([flag("x"), flag("y")]);
    const { container } = render(<SencoView />);

    await waitFor(() => expect(visibleText(container)).toMatch(/At least 2 to look at/));
    complete.value = true;
  });
});
