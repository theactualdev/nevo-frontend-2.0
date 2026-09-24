import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
    expect(visibleText(container)).toMatch(/Your school code/i);
    expect(visibleText(container)).toMatch(/staff and students can join/i);
  });

  it("is absent rather than blank when there is no code", async () => {
    // `School.code` is nullable. A card headed "Your school code" over an
    // empty space is worse than no card.
    get.mockResolvedValue(school(null));
    const { container } = render(<SchoolCodeCard />);

    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("does not claim a school has no code when the read failed", async () => {
    // A school that cannot be read has not lost its code.
    get.mockRejectedValue(new Error("500"));
    const { container } = render(<SchoolCodeCard />);

    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    expect(visibleText(container)).not.toMatch(/no code|couldn.t/i);
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
    const btn = await screen.findByRole("button", { name: /Copy code/i });
    btn.click();

    await waitFor(() => expect(visibleText(container)).toMatch(/BGA-4827/));
    expect(screen.queryByRole("button", { name: /^Copied$/ })).toBeNull();
  });
});
