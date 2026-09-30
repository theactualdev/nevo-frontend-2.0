import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import type { AdminClass } from "@/lib/api/classes";
import { ClassesView } from "./ClassesView";

/**
 * Pressing "Show archived" to LOOK at last year's groups changed the school's
 * own figures underneath the proprietor.
 *
 * The toggle refetches with `includeArchived`, so the list grows - and the
 * header summed straight across it. "14 classes · 312 students" became "17
 * classes · 383 students", with nothing saying why, and 71 of those children
 * are in classes nobody teaches any more.
 */

const list = vi.fn();

vi.mock("@/lib/api/classes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/classes")>();
  return {
    ...actual,
    classesApi: {
      ...actual.classesApi,
      list: (includeArchived?: boolean) => list(includeArchived),
      classTeachers: async () => [],
    },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const klass = (
  id: string,
  studentCount: number,
  archivedAt: string | null = null,
  source: AdminClass["source"] = null,
): AdminClass => ({
  id,
  name: `Class ${id}`,
  code: null,
  yearGroup: "jss2",
  source,
  subjects: [],
  studentCount,
  section: null,
  academicSession: null,
  capacity: null,
  teacherCount: 0,
  teachers: [],
  archivedAt,
});

const ACTIVE = [klass("a", 20), klass("b", 12)];
const WITH_ARCHIVED = [...ACTIVE, klass("c", 71, "2026-07-31T00:00:00Z")];

async function showArchived() {
  fireEvent.click(await screen.findByRole("button", { name: "Show archived" }));
}

describe("ClassesView header", () => {
  it("keeps the school's own figures when archived classes are revealed", async () => {
    list.mockImplementation((includeArchived?: boolean) =>
      Promise.resolve(includeArchived ? WITH_ARCHIVED : ACTIVE),
    );

    const { container } = render(<ClassesView />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/2 classes · 32 students/),
    );

    await showArchived();

    // The figures that describe the school do not move...
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/plus 1 archived/),
    );
    expect(visibleText(container)).toMatch(/2 classes · 32 students/);
    // ...and the numbers that used to appear are gone.
    expect(visibleText(container)).not.toMatch(/3 classes/);
    expect(visibleText(container)).not.toMatch(/103 students/);
  });

  it("says nothing about archived classes when there are none", async () => {
    list.mockResolvedValue(ACTIVE);

    const { container } = render(<ClassesView />);
    await waitFor(() =>
      expect(visibleText(container)).toMatch(/2 classes · 32 students/),
    );
    // The "Show archived" toggle always says the word; what must be absent is
    // the header's own clause about them.
    expect(visibleText(container)).not.toMatch(/plus \d+ archived/i);
  });

  it("still reveals the archived rows themselves", async () => {
    list.mockImplementation((includeArchived?: boolean) =>
      Promise.resolve(includeArchived ? WITH_ARCHIVED : ACTIVE),
    );

    const { container } = render(<ClassesView />);
    await screen.findByRole("button", { name: "Show archived" });
    expect(visibleText(container)).not.toMatch(/Class c/);

    await showArchived();
    // The toggle's actual job.
    await waitFor(() => expect(visibleText(container)).toMatch(/Class c/));
  });

  it("does not offer Create on an SSO school when an old manual class is revealed", async () => {
    /*
     * `ssoSourced` reads the same list. One archived manually-made class from
     * before the provider was connected would flip `every` the moment somebody
     * pressed the toggle, and Create - which the spec says is ABSENT, not
     * disabled, on an SSO school - would reappear.
     */
    const synced = [klass("a", 20, null, "roster_sync")];
    const withOldManual = [...synced, klass("old", 9, "2026-07-31T00:00:00Z")];
    list.mockImplementation((includeArchived?: boolean) =>
      Promise.resolve(includeArchived ? withOldManual : synced),
    );

    render(<ClassesView />);
    await screen.findByRole("button", { name: "Show archived" });
    expect(screen.queryByRole("button", { name: /Create a class/ })).toBeNull();

    await showArchived();
    await waitFor(() => expect(list).toHaveBeenCalledWith(true));
    expect(screen.queryByRole("button", { name: /Create a class/ })).toBeNull();
  });
  it("keeps Create absent on an SSO school whose only live class was archived", async () => {
    /*
     * The regression the narrowing introduced. `ssoSourced` moved to
     * `activeClasses` while the Create gate still read the raw list, so an SSO
     * school with zero ACTIVE classes short-circuited `ssoSourced` to false
     * while the archived rows still satisfied `classes.length > 0` - and
     * Create, which SCRUM-97 says must be ABSENT, came back.
     */
    const synced = [klass("a", 20, null, "roster_sync")];
    const allArchived = [klass("a", 20, "2026-07-31T00:00:00Z", "roster_sync")];
    list.mockImplementation((includeArchived?: boolean) =>
      Promise.resolve(includeArchived ? allArchived : synced),
    );

    render(<ClassesView />);
    await showArchived();
    await waitFor(() => expect(list).toHaveBeenCalledWith(true));

    expect(screen.queryByRole("button", { name: /Create a class/ })).toBeNull();
  });
});

describe("a school whose classes are all archived", () => {
  it("can still reach them from the empty state", async () => {
    // The list is fetched without archived classes, so this school landed on
    // "No classes yet" - and the Show archived toggle lives only in the list.
    list.mockImplementation((includeArchived?: boolean) =>
      Promise.resolve(includeArchived ? [klass("old", 30, "2026-07-31T00:00:00Z")] : []),
    );
    const { container } = render(<ClassesView />);

    await waitFor(() => expect(visibleText(container)).toMatch(/No classes yet/));
    fireEvent.click(screen.getByRole("button", { name: "Show archived classes" }));

    await waitFor(() => expect(visibleText(container)).toMatch(/Class old/));
  });
});
