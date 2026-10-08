import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { useTeacherClasses, hydrated } = vi.hoisted(() => ({
  useTeacherClasses: vi.fn(),
  hydrated: { value: true },
}));
vi.mock("@/hooks/useTeacherClasses", () => ({ useTeacherClasses }));
vi.mock("@/hooks/useHydrated", () => ({ useHydrated: () => hydrated.value }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("./LiveClassDetail", () => ({
  LiveClassDetail: ({ klass }: { klass: { className: string } }) => <p>{`live ${klass.className}`}</p>,
}));
vi.mock("./ClassDetail", () => ({ ClassDetail: () => <p>sample class</p> }));

import { ClassRoute } from "./ClassRoute";
import { clearSession, setSession } from "@/lib/auth/session";
import { TEACHER_CLASSES } from "@/lib/mocks/teacherClasses";

/**
 * T242. The class route's branches, each a past bug: a teacher's own class
 * answered 404 on a hard load; a fixture flashed under a real class id while
 * the list was in flight; and a failed list read was taken as proof the class
 * did not exist.
 */

const FIXTURE = TEACHER_CLASSES[0];
const REAL = { classId: "c-1", className: "Year 7 Blue", classCode: "7B" };

const classes = (over: Record<string, unknown> = {}) =>
  useTeacherClasses.mockReturnValue({
    classes: [],
    liveClasses: [],
    options: [],
    live: false,
    loading: false,
    sample: false,
    ...over,
  });

const signIn = () =>
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: "t-1",
    role: "teacher" as never,
  });

beforeEach(() => {
  hydrated.value = true;
  clearSession();
  window.localStorage.clear();
  classes();
});

describe("before the client is running", () => {
  it("decides nothing, so a real class is not answered with a 404", () => {
    hydrated.value = false;
    signIn();
    classes({ live: true });

    expect(() => render(<ClassRoute fixture={null} classId="c-1" />)).not.toThrow();
    expect(screen.queryByText(/live|sample/)).not.toBeInTheDocument();
  });
});

describe("a signed-in teacher", () => {
  beforeEach(signIn);

  it("sees their own class", () => {
    classes({ live: true, liveClasses: [REAL] });
    render(<ClassRoute fixture={null} classId="c-1" />);

    expect(screen.getByText("live Year 7 Blue")).toBeInTheDocument();
  });

  it("sees their own class even where a sample shares its id", () => {
    classes({ live: true, liveClasses: [{ ...REAL, classId: FIXTURE.id }] });
    render(<ClassRoute fixture={FIXTURE} classId={FIXTURE.id} />);

    expect(screen.getByText("live Year 7 Blue")).toBeInTheDocument();
    expect(screen.queryByText("sample class")).not.toBeInTheDocument();
  });

  it("is shown no sample while the class list is still in flight", () => {
    classes({ loading: true });
    render(<ClassRoute fixture={FIXTURE} classId={FIXTURE.id} />);

    expect(screen.queryByText("sample class")).not.toBeInTheDocument();
  });

  it("is not-found for a class that is not theirs, once the list has answered", () => {
    classes({ live: true, liveClasses: [REAL] });

    expect(() => render(<ClassRoute fixture={null} classId="c-other" />)).toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("is told the list could not be read, not that the class does not exist", () => {
    classes({ sample: true });
    render(<ClassRoute fixture={null} classId="c-1" />);

    expect(screen.getByText(/couldn.t load this class/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("a visitor who is not signed in", () => {
  it("walks the designed class, marked as a sample", () => {
    const { container } = render(<ClassRoute fixture={FIXTURE} classId={FIXTURE.id} />);

    expect(screen.getByText("sample class")).toBeInTheDocument();
    expect(container.querySelector("[data-nevo-sample]")).not.toBeNull();
  });

  it("is not-found where there is no designed class", () => {
    expect(() => render(<ClassRoute fixture={null} classId="c-1" />)).toThrow("NEXT_NOT_FOUND");
  });
});
