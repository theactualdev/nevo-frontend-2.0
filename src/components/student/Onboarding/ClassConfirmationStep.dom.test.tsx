import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ClassConfirmationStep } from "./ClassConfirmationStep";

/**
 * FOURTEEN INVENTED CLASS NAMES, ON ONE OF THE FIRST SCREENS A SCHOOL SEES.
 *
 * "Year 2 Wrens", "Year 5 Otters", eleven more. Rendered whenever `verified` -
 * `Boolean(draft.schoolCode)` - was false. Rule 5: there was no roster, so one
 * was invented. Product's framing is the sharper one - invented classes at that
 * moment tell a school the system does not know them.
 *
 * AND IT WAS NEVER ONLY THE WALKTHROUGH, which is the half that made it a
 * defect rather than a demo artefact. `getOnboardingDraft` returns `{}` both
 * when no school was verified and when the sessionStorage write silently
 * failed - `mergeOnboardingDraft` swallows that on purpose, for private mode.
 * So a child who typed their real school code in a private or storage-blocked
 * browser reached this screen, saw fourteen classes belonging to no school, and
 * picking one wrote `classId: undefined`. That is the exact failure the
 * docblock on `pick` claims to have fixed; the fix keyed on `schoolCode`, and
 * this path has no `schoolCode` to key on.
 *
 * The empty state deliberately does NOT reuse the verified-but-empty copy.
 * That screen says "<school> is connected", which would swap fourteen invented
 * classes for one invented connection.
 */

const draft = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
const merged = vi.hoisted(() => ({ calls: [] as unknown[] }));
vi.mock("@/lib/auth/onboarding", () => ({
  getOnboardingDraft: () => draft.value,
  mergeOnboardingDraft: (patch: unknown) => merged.calls.push(patch),
}));

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }),
}));

vi.mock("@/hooks/useNevoKeyboardDock", () => ({
  useNevoKeyboardDock: () => ({ open: false, dock: null }),
}));

/** The names that used to be here. None may appear in any state. */
const INVENTED =
  /Wrens|Sparrows|Robins|Swifts|Larks|Falcons|Kingfishers|Herons|Otters|Badgers|Voles|Foxes|Hawks|Ravens/i;

const body = () => document.body.textContent ?? "";

beforeEach(() => {
  draft.value = {};
  merged.calls = [];
  push.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("a child whose school we never verified", () => {
  it("is shown no class names at all", () => {
    render(<ClassConfirmationStep />);

    expect(body()).not.toMatch(INVENTED);
  });

  it("is told we do not have their school, not that it is connected", () => {
    // The distinction that stops this becoming a smaller lie: "<school> is
    // connected, but it hasn't added any classes" is true only after a school
    // code verified.
    render(<ClassConfirmationStep />);

    expect(body()).toMatch(/don.t have your school yet/i);
    expect(body()).not.toMatch(/is connected/i);
  });

  it("is given the way in that needs no roster", () => {
    render(<ClassConfirmationStep />);

    expect(
      screen.getByRole("button", { name: "Enter a class code" }),
    ).toBeInTheDocument();
  });

  it("cannot pick a class, so cannot write an undefined class id", () => {
    // The account-costing half. `pick` was the only writer of `classId`, and a
    // name off the invented list had no id to carry - three screens later
    // `connectClassCode({ classId: undefined })` threw and the child was
    // dropped back to the PIN row with nothing said to them.
    render(<ClassConfirmationStep />);

    expect(merged.calls).toEqual([]);
  });
});

describe("the storage-blocked child, who has no school code to key on", () => {
  it("gets the same honest screen as an unverified one", () => {
    /*
     * Indistinguishable from "never verified" by construction: both are `{}`,
     * because `mergeOnboardingDraft` swallows a failed sessionStorage write.
     * That is precisely why keying the old fix on `schoolCode` could not reach
     * this child, and why the fix is to have no invented list at all rather
     * than a better condition for showing one.
     */
    draft.value = {}; // a real school code was typed; the write was refused

    render(<ClassConfirmationStep />);

    expect(body()).not.toMatch(INVENTED);
    expect(body()).toMatch(/don.t have your school yet/i);
  });
});

describe("a verified school still behaves as it did", () => {
  it("lists the roster the school actually returned", () => {
    draft.value = {
      schoolCode: "NEVO-E2E",
      schoolName: "Kano Primary",
      classes: [
        { id: "c1", name: "Primary 4 Blue" },
        { id: "c2", name: "Primary 4 Gold" },
      ],
    };

    render(<ClassConfirmationStep />);

    expect(screen.getByText("Primary 4 Blue")).toBeInTheDocument();
    expect(screen.getByText("Primary 4 Gold")).toBeInTheDocument();
  });

  it("says the school is connected when its roster is genuinely empty", () => {
    // The copy that IS true here, and the reason the unverified path needed its
    // own screen rather than borrowing this one.
    draft.value = {
      schoolCode: "NEVO-E2E",
      schoolName: "Kano Primary",
      classes: [],
    };

    render(<ClassConfirmationStep />);

    expect(body()).toMatch(/Kano Primary is connected/i);
  });
});

describe("two classes with the same name", () => {
  it("lights only the one the child tapped", () => {
    /*
     * Two year groups can both have a "Gold". The highlight was keyed on the
     * name, so tapping one lit both - while the join posted the right id, so
     * the screen and the record disagreed about which class this was.
     */
    draft.value = {
      schoolCode: "NEVO-E2E",
      schoolName: "Kano Primary",
      classes: [
        { id: "c4", name: "Gold" },
        { id: "c5", name: "Gold" },
      ],
    };
    render(<ClassConfirmationStep />);

    const [first, second] = screen.getAllByRole("button", { name: "Gold" });
    fireEvent.click(second);

    expect(second.className).toContain("border-nevo-navy");
    expect(first.className).not.toContain("border-nevo-navy");
    expect(merged.calls).toContainEqual({ className: "Gold", classId: "c5" });
  });
});

describe("before the draft has been read", () => {
  it("renders no class names, because the server cannot see sessionStorage", () => {
    // Drawing anything here would flash it at a real child for a frame - the
    // same shape of bug as the notification bell's missing hydration guard.
    draft.value = {};
    render(<ClassConfirmationStep />);

    expect(body()).not.toMatch(INVENTED);
  });
});
