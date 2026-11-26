import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { SchoolSettings } from "./SchoolSettings";

/**
 * Backlog 68 (T19): School settings says when the school was last saved -
 * D12's "Last saved 3 days ago" - once, at the top, as Lydia ruled (L42, 25
 * Nov), never a line per section. From the record's `updatedAt`, and nothing
 * at all without one.
 */

const get = vi.fn();
const saveAcademic = vi.fn();
const update = vi.fn();
const saveContact = vi.fn();

vi.mock("@/lib/api/school", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/school")>();
  return {
    ...actual,
    schoolApi: {
      ...actual.schoolApi,
      get: () => get(),
      saveAcademic: (p: unknown) => saveAcademic(p),
      update: (p: unknown) => update(p),
      saveContact: (p: unknown) => saveContact(p),
    },
  };
});

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

const school = (updatedAt: string | null | undefined) => ({
  id: "sch1",
  name: "Brightgate Academy",
  code: "BRG-1",
  retentionPolicy: "contract",
  retentionDays: 365,
  profile: {},
  academicConfig: {},
  ...(updatedAt === undefined ? {} : { updatedAt }),
});

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue(school(daysAgo(3)));
  update.mockResolvedValue(school(daysAgo(3)));
  saveAcademic.mockResolvedValue(school(daysAgo(3)));
  saveContact.mockResolvedValue(school(daysAgo(3)));
});

describe("Last saved (backlog 68, T19)", () => {
  it("says when the school was last saved, in D12's words, once and above every section", async () => {
    const { container } = render(<SchoolSettings />);
    const name = await screen.findByLabelText("School name");
    expect(visibleText(container)).toMatch(/Last saved 3 days ago/);
    expect(visibleText(container).match(/Last saved/g)).toHaveLength(1);
    const line = container.querySelector("[data-last-saved]")!;
    expect(line.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("reads 'just now' after a save, from the record the server answers with", async () => {
    saveContact.mockResolvedValue(school(new Date().toISOString()));
    const { container } = render(<SchoolSettings />);
    await screen.findByLabelText("School name");
    fireEvent.click(screen.getAllByRole("button", { name: "Save changes" })[0]);
    await waitFor(() => expect(visibleText(container)).toMatch(/Last saved just now/));
  });

  it.each([
    ["null", null],
    ["absent (an older answer)", undefined],
    ["unreadable", "not a date"],
  ])("shows no line when the time is %s - never 'Last saved never'", async (_, updatedAt) => {
    get.mockResolvedValue(school(updatedAt));
    const { container } = render(<SchoolSettings />);
    await screen.findByLabelText("School name");
    expect(container.querySelector("[data-last-saved]")).toBeNull();
    expect(visibleText(container)).not.toMatch(/Last saved/i);
  });
});
