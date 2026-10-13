import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { setYearGroupLabels, yearGroupLabel } from "@/lib/constants/yearGroups";
import { composeClassNames } from "../Classes/composeClassNames";
import { AdminShell } from "./AdminShell";

/**
 * `yearGroups.ts`: the school's label map "is set once, at the top of the
 * admin console". Nothing set it outside Settings, so every other screen read
 * the defaults - and Add several composed class names from them.
 */

const get = vi.fn();
let pathname = "/admin/classes";

vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("./AdminSidebar", () => ({ AdminSidebar: () => <nav>rail</nav> }));
vi.mock("@/lib/api/school", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/school")>();
  return { ...actual, schoolApi: { ...actual.schoolApi, get: () => get() } };
});

function Label() {
  return <p>{yearGroupLabel("jss2")}</p>;
}

const mounted = vi.fn();
function Counted() {
  useEffect(() => {
    mounted();
  }, []);
  return <p>page</p>;
}

beforeEach(() => {
  vi.clearAllMocks();
  pathname = "/admin/classes";
});
afterEach(() => setYearGroupLabels(undefined));

describe("the admin shell installs the school's year-group labels", () => {
  it("so every screen - and every composed class name - uses them", async () => {
    get.mockResolvedValue({ name: "Brightgate", academicConfig: { yearGroupLabels: { jss2: "Year 8" } } });
    render(
      <AdminShell>
        <Label />
      </AdminShell>,
    );
    // A screen already on display picks them up too.
    await screen.findByText("Year 8");
    expect(
      composeClassNames({ yearGroup: "jss2", sections: ["A"], existing: [] }).map((c) => c.name),
    ).toEqual(["Year 8A"]);
  });

  it("leaves a school on the defaults alone - no remount", async () => {
    get.mockResolvedValue({ name: "Brightgate", academicConfig: {} });
    render(
      <AdminShell>
        <Counted />
      </AdminShell>,
    );
    await waitFor(() => expect(get).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 10));
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(yearGroupLabel("jss2")).toBe("JSS 2");
  });

  it("keeps the defaults when the school cannot be read", async () => {
    get.mockRejectedValue(new Error("500"));
    render(
      <AdminShell>
        <Label />
      </AdminShell>,
    );
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(screen.getByText("JSS 2")).toBeInTheDocument();
  });

  it("does not read the school on onboarding, which has no workspace yet", () => {
    pathname = "/admin/onboarding";
    render(
      <AdminShell>
        <Label />
      </AdminShell>,
    );
    expect(get).not.toHaveBeenCalled();
  });
});
