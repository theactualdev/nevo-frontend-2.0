import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";
import { visibleText } from "@/test/visibleText";
import { SchoolCodeCard } from "./SchoolCodeCard";

/**
 * The join code, on the dashboard where D01 moved it.
 *
 * *"A code handed over once at the end of onboarding is a code the school
 * loses the moment they close the tab."* It was on exactly two screens - the
 * wizard's last step and the IT home - and both came off the same day.
 */

const get = vi.fn();

vi.mock("@/lib/api/school", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/school")>();
  return {
    ...actual,
    schoolApi: { ...actual.schoolApi, get: () => get() },
  };
});

const school = (code: string | null) => ({
  id: "s1",
  name: "Brightgate Academy",
  code,
  slug: "brightgate",
  profile: {},
  academicConfig: {},
  retentionPolicy: "contract",
  retentionDays: 365,
});

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue(school("BGA-4827"));
});

describe("SchoolCodeCard", () => {
  it("shows the code, and says what it is for", async () => {
    const { container } = render(<SchoolCodeCard />);

    await waitFor(() => expect(visibleText(container)).toMatch(/BGA-4827/));
    expect(visibleText(container)).toMatch(/School code/i);
    expect(visibleText(container)).toMatch(
      /Share this so staff and students can join\. It also lives under IT & SSO\./,
    );
  });

  it("sets the code as D04 draws it: monospace, 600, navy, 0.12em, 22px (19px on tablet)", async () => {
    render(<SchoolCodeCard />);
    const code = await screen.findByText("BGA-4827");
    const cls = code.className;
    for (const token of [
      "font-mono",
      "font-semibold",
      "text-nevo-navy",
      "tracking-[0.12em]",
      "text-[19px]",
      "lg:text-[22px]",
    ]) {
      expect(cls).toContain(token);
    }
    expect(cls).not.toMatch(/text-nevo-near-black|tracking-\[0\.18em\]|text-\[28px\]/);
  });

  it("is absent rather than blank when there is no code", async () => {
    // `School.code` is nullable. A card headed "Your school code" over an
    // empty space is worse than no card.
    get.mockResolvedValue(school(null));
    const { container } = render(<SchoolCodeCard />);

    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("says it couldn't pull the code in when the read failed - never that there's none (backlog 33)", async () => {
    // A school that cannot be read has not lost its code - and a card that
    // vanishes says nothing either. SCRUM-39's per-card line, with Try again.
    get.mockRejectedValueOnce(new Error("500"));
    const { container } = render(<SchoolCodeCard />);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/We couldn't pull this in just now\. We're on it\./),
    );
    expect(visibleText(container)).toMatch(/School code/);
    expect(visibleText(container)).not.toMatch(/no code/i);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("BGA-4827")).toBeInTheDocument();
    expect(visibleText(container)).not.toMatch(/couldn't pull/);
  });

  it("stays absent on a 403 - not a fault, and asking again can't change it", async () => {
    get.mockRejectedValue(new ApiError(403, "forbidden"));
    const { container } = render(<SchoolCodeCard />);

    await waitFor(() => expect(get).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it("does not say Copied when the clipboard refused", async () => {
    /*
     * Saying "Copied" over a refused clipboard sends somebody to paste
     * nothing. The code is on screen either way, so the honest failure costs
     * a retype rather than a mystery.
     */
    Object.assign(navigator, {
      clipboard: { writeText: () => Promise.reject(new Error("denied")) },
    });
    const { container } = render(<SchoolCodeCard />);
    const btn = await screen.findByRole("button", { name: /Copy school code/i });
    btn.click();

    await waitFor(() => expect(visibleText(container)).toMatch(/BGA-4827/));
    expect(screen.queryByRole("button", { name: /^Copied$/ })).toBeNull();
  });
});
