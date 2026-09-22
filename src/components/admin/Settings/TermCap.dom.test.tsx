import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { ApiError } from "@/lib/api/client";
import { SchoolSettings } from "./SchoolSettings";

/**
 * THE FOURTH TERM, and who was actually dropping it.
 *
 * We filed this against backend as silent truncation on their side. It was
 * ours: `termStartDatesFrom` ended `.slice(0, 3)`, so the request that would
 * have been refused was never made and the save reported success. Backend has
 * always answered 422, and on 22 Sep rewrote that 422 to say WHY - billing
 * issues one invoice per term start.
 *
 * Three things have to hold now: the form stops at three and says why, a
 * fourth date that does exist reaches the server, and the server's reason is
 * shown rather than swallowed.
 */

const get = vi.fn();
const saveAcademic = vi.fn();

vi.mock("@/lib/api/school", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/school")>();
  return {
    ...actual,
    schoolApi: {
      ...actual.schoolApi,
      get: () => get(),
      saveAcademic: (p: unknown) => saveAcademic(p),
    },
  };
});

const term = (n: number, start: string) => ({
  id: `t${n}`,
  name: `Term ${n}`,
  start,
  end: "",
});

const school = (terms: ReturnType<typeof term>[]) => ({
  id: "sch1",
  name: "Brightgate Academy",
  code: "BRG-1",
  academicConfig: {
    yearStart: "2026-09-01",
    yearEnd: "2027-07-31",
    terms,
  },
});

const THREE = [
  term(1, "2026-09-07"),
  term(2, "2027-01-11"),
  term(3, "2027-04-19"),
];

beforeEach(() => {
  vi.clearAllMocks();
  saveAcademic.mockResolvedValue(school(THREE));
});

describe("the term cap", () => {
  it("stops offering a fourth term, and says why rather than going quiet", async () => {
    get.mockResolvedValue(school(THREE));
    const { container } = render(<SchoolSettings />);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/3 terms in your year/i),
    );
    expect(screen.queryByRole("button", { name: "Add a term" })).toBeNull();
    // The reason, not just the absence.
    expect(visibleText(container)).toMatch(/Nevo stores three term starts/i);
    expect(visibleText(container)).toMatch(/billing period/i);
  });

  it("still offers it below three", async () => {
    get.mockResolvedValue(school([term(1, "2026-09-07")]));
    render(<SchoolSettings />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add a term" })).toBeEnabled(),
    );
  });

  it("sends a fourth date that already exists instead of cutting it off", async () => {
    /*
     * A calendar stored before the cap was enforced in the form. The save must
     * reach the server and be refused there - a 422 is a school being told.
     */
    get.mockResolvedValue(
      school([...THREE, term(4, "2027-08-01")]),
    );
    const { container } = render(<SchoolSettings />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/4 terms in your year/i),
    );

    const saves = screen.getAllByRole("button", { name: "Save changes" });
    fireEvent.click(saves[1]);

    await waitFor(() => expect(saveAcademic).toHaveBeenCalled());
    const sent = saveAcademic.mock.calls[0][0] as { termStartDates: string[] };
    expect(sent.termStartDates).toHaveLength(4);
    expect(sent.termStartDates).toContain("2027-08-01");
  });

  it("shows the server's reason instead of 'that didn't save'", async () => {
    get.mockResolvedValue(school([...THREE, term(4, "2027-08-01")]));
    saveAcademic.mockRejectedValue(
      new ApiError(422, "Unprocessable", {
        detail: {
          code: "validation_error",
          message:
            "Nevo issues one invoice per term start, so a fourth date is a fourth invoice.",
          errors: [],
        },
      }),
    );

    const { container } = render(<SchoolSettings />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/4 terms in your year/i),
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Save changes" })[1]);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/one invoice per term start/i),
    );
    expect(visibleText(container)).not.toMatch(/that didn.t save/i);
  });

  it("keeps the generic line when the server explained nothing", async () => {
    // A 500 or a dropped connection carries no message worth repeating.
    get.mockResolvedValue(school(THREE));
    saveAcademic.mockRejectedValue(new Error("network"));

    const { container } = render(<SchoolSettings />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/3 terms in your year/i),
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Save changes" })[1]);

    await waitFor(() =>
      expect(visibleText(container)).toMatch(/that didn.t save/i),
    );
  });
});
