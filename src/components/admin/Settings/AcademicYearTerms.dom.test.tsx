import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { SchoolSettings } from "./SchoolSettings";
import { nowIndex, termHasEnded, yearLabel } from "./academicCalendar";

/**
 * Backlog 22, D12.3 (SCRUM-99): the year label made from the dates, the
 * current term's violet "Now" pill, past terms at 0.6 but still editable, and
 * Remove confirmed inline on the row.
 */

const get = vi.fn();
vi.mock("@/lib/api/school", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/school")>();
  return { ...actual, schoolApi: { ...actual.schoolApi, get: () => get() } };
});

const DAY = 24 * 60 * 60 * 1000;
const ymd = (offsetDays: number) => {
  const d = new Date(Date.now() + offsetDays * DAY);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const TERMS = [
  { id: "t1", name: "First term", start: ymd(-120), end: ymd(-40) },
  { id: "t2", name: "Second term", start: ymd(-10), end: ymd(30) },
  { id: "t3", name: "Third term", start: ymd(60), end: ymd(140) },
];

const school = (terms = TERMS) => ({
  id: "sch1",
  name: "Brightgate Academy",
  code: "BRG-1",
  retentionPolicy: "contract",
  retentionDays: 365,
  profile: {},
  academicConfig: { yearStart: terms[0].start, yearEnd: terms[terms.length - 1].end, terms },
});

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue(school());
});

const rows = (c: HTMLElement) => [...c.querySelectorAll("[data-term-row]")] as HTMLElement[];

describe("Academic year (backlog 22, D12.3)", () => {
  it("shows the year's label, made from its dates and not editable", async () => {
    render(<SchoolSettings />);
    const year = (await screen.findByLabelText("Year")) as HTMLInputElement;
    expect(year.value).toBe(yearLabel(TERMS[0].start, TERMS[2].end));
    expect(year.readOnly).toBe(true);
  });

  it("marks the current term Now, and dims the past one but leaves it editable", async () => {
    const { container } = render(<SchoolSettings />);
    await screen.findByLabelText("Year");
    const [first, second, third] = rows(container);
    expect(within(second).getByText("Now")).toBeInTheDocument();
    expect(within(first).queryByText("Now")).toBeNull();
    expect(within(third).queryByText("Now")).toBeNull();
    expect(first.className).toMatch(/\bopacity-60\b/);
    expect(second.className).not.toMatch(/opacity-60/);
    expect(within(first).getByLabelText("Term 1 name")).not.toBeDisabled();
  });

  it("confirms Remove inline, and Keep it leaves the term where it was", async () => {
    const { container } = render(<SchoolSettings />);
    await screen.findByLabelText("Year");
    fireEvent.click(within(rows(container)[2]).getByRole("button", { name: "Remove" }));
    // Nothing came off yet: the row is still there, asking.
    expect(rows(container)).toHaveLength(3);
    expect(visibleText(container)).toMatch(
      /Third term comes off your calendar when you save\. The other terms stay as they are\./,
    );
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(rows(container)).toHaveLength(3);
    expect(container.querySelector("[data-remove-term]")).toBeNull();
  });

  it("takes the term off the draft on Remove this term", async () => {
    const { container } = render(<SchoolSettings />);
    await screen.findByLabelText("Year");
    fireEvent.click(within(rows(container)[2]).getByRole("button", { name: "Remove" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove this term" }));
    expect(rows(container)).toHaveLength(2);
    expect(visibleText(container)).not.toMatch(/Third term/);
  });

  it("offers no Remove on the only term", async () => {
    get.mockResolvedValue(school([TERMS[1]]));
    const { container } = render(<SchoolSettings />);
    await screen.findByLabelText("Year");
    expect(within(rows(container)[0]).queryByRole("button", { name: "Remove" })).toBeNull();
  });
});

describe("the calendar's derived lines", () => {
  it("labels the year from its dates, and gives no label it can't stand behind", () => {
    expect(yearLabel("2026-09-07", "2027-07-24")).toBe("2026 / 27");
    expect(yearLabel("2026-01-12", "2026-12-11")).toBe("2026");
    expect(yearLabel("2099-09-01", "2100-07-01")).toBe("2099 / 00");
    expect(yearLabel("2026-09-07", "")).toBeNull();
    expect(yearLabel("2027-09-07", "2026-07-24")).toBeNull();
  });

  it("names no term Now between terms, and a term is past only after its last day", () => {
    const now = Date.now();
    expect(nowIndex(TERMS, now)).toBe(1);
    expect(nowIndex([TERMS[0], TERMS[2]], now)).toBe(-1);
    expect(termHasEnded({ id: "x", name: "x", start: ymd(-5), end: ymd(0) }, now)).toBe(false);
    expect(termHasEnded({ id: "x", name: "x", start: ymd(-5), end: ymd(-1) }, now)).toBe(true);
  });
});

describe("a school that hasn't set its terms (backlog 69, SCRUM-99 NOT SET UP)", () => {
  const LINE = /Until you set your terms, Nevo says .since setup. instead of naming a term\./;

  it("says what Nevo says meanwhile, while the saved record holds no term starts", async () => {
    get.mockResolvedValue({ ...school(), academicConfig: {} });
    const { container } = render(<SchoolSettings />);
    await screen.findByLabelText("Year starts");
    expect(visibleText(container)).toMatch(LINE);
  });

  it("keeps saying it for terms typed but not yet saved - they've told Nevo nothing", async () => {
    get.mockResolvedValue({ ...school(), academicConfig: {} });
    const { container } = render(<SchoolSettings />);
    fireEvent.click(await screen.findByRole("button", { name: "Add a term" }));
    expect(rows(container)).toHaveLength(1);
    expect(visibleText(container)).toMatch(LINE);
  });

  it("says nothing once the school's term starts are saved", async () => {
    get.mockResolvedValue({
      ...school(),
      academicConfig: { ...school().academicConfig, termStartDates: TERMS.map((t) => t.start) },
    });
    const { container } = render(<SchoolSettings />);
    await screen.findByLabelText("Year");
    expect(container.querySelector("[data-terms-not-set]")).toBeNull();
  });

  it("offers no made-up calendar: a fresh school's terms start empty", async () => {
    get.mockResolvedValue({ ...school(), academicConfig: {} });
    const { container } = render(<SchoolSettings />);
    await screen.findByLabelText("Year starts");
    expect(rows(container)).toHaveLength(0);
    expect((screen.getByLabelText("Year starts") as HTMLInputElement).value).toBe("");
  });
});
