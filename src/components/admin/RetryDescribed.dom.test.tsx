import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { AdminClass } from "@/lib/api/classes";
import { ReadFailed } from "./ReadFailed";
import { BulkClassSheet } from "./Classes/BulkClassSheet";

/**
 * TWO "TRY AGAIN"s, EACH SAYING WHICH (check 14's flake, 19 Nov). Add several
 * reads the school's subjects as well as saving, and when both fail the sheet
 * holds two buttons called "Try again". A screen reader met them with nothing
 * to tell them apart. Each is now described by its own sentence - the words
 * on screen are unchanged.
 */

const createMany = vi.fn();
vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return {
    ...actual,
    classesApi: {
      ...actual.classesApi,
      list: async () => [{ id: "c1", name: "JSS 1A", yearGroup: "jss1", archivedAt: null } as AdminClass],
      createMany: () => createMany(),
    },
  };
});
vi.mock("@/lib/api/subjects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/subjects")>();
  return {
    ...actual,
    subjectsApi: {
      ...actual.subjectsApi,
      list: () => Promise.reject(new Error("500")),
      canonical: async () => [],
    },
  };
});

describe("a Try again names what it retries", () => {
  it("ReadFailed's button is described by its own sentence", () => {
    render(<ReadFailed what="your classes" onRetry={() => {}} />);
    expect(screen.getByRole("button", { name: "Try again" })).toHaveAccessibleDescription(
      /We couldn’t read your classes just now/,
    );
  });

  it("with the subjects read and the save both failed, the two are told apart", async () => {
    createMany.mockRejectedValue(new Error("500"));
    render(<BulkClassSheet onClose={() => {}} onCreated={() => {}} />);
    const jss1 = await screen.findByRole("group", { name: "JSS 1" });
    fireEvent.click(within(jss1).getByRole("button", { name: "B" }));
    fireEvent.click(await screen.findByRole("button", { name: /^Create 1 class$/ }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Try again" })).toHaveLength(2));

    const [first, second] = screen.getAllByRole("button", { name: "Try again" });
    const descriptions = [first, second].map((b) => {
      const ids = (b.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
      return ids.map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
    });
    expect(descriptions.some((d) => /couldn’t read your school['’]s subject list/.test(d))).toBe(true);
    expect(descriptions.some((d) => /no classes were created/.test(d))).toBe(true);
  });
});
