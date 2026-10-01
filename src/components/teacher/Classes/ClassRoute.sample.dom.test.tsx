import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { useTeacherClasses } = vi.hoisted(() => ({ useTeacherClasses: vi.fn() }));
vi.mock("@/hooks/useTeacherClasses", () => ({ useTeacherClasses }));
vi.mock("@/hooks/useHydrated", () => ({ useHydrated: () => true }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { ClassRoute } from "./ClassRoute";
import { TEACHER_CLASSES } from "@/lib/mocks/teacherClasses";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * A SAMPLE CLASS'S JOIN CODE, ON A PROJECTOR.
 *
 * A signed-in teacher whose class list failed reached the fixture class
 * detail, and its "Class code" button opened a real, scannable QR of a
 * fixture join code. `ClassCodeRoute` refuses exactly this, because a
 * projected code is the one thing on the console a room of children
 * physically acts on - and a sample mark stops nobody scanning it.
 */

const FIXTURE = TEACHER_CLASSES[0];

beforeEach(() => {
  clearSession();
  window.localStorage.clear();
  useTeacherClasses.mockReturnValue({
    classes: TEACHER_CLASSES,
    liveClasses: [],
    options: [],
    live: false,
    loading: false,
    sample: true,
  });
});

const signIn = () =>
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: "t-1",
    role: "teacher",
  });

describe("the class code on a sample class", () => {
  it("is not offered to a signed-in teacher whose class read failed", () => {
    signIn();
    render(<ClassRoute fixture={FIXTURE} classId={FIXTURE.id} />);

    expect(screen.getByText(FIXTURE.name)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Class code/ })).not.toBeInTheDocument();
  });

  it("is still offered on the signed-out walkthrough", () => {
    useTeacherClasses.mockReturnValue({
      classes: TEACHER_CLASSES,
      liveClasses: [],
      options: [],
      live: false,
      loading: false,
      sample: false,
    });
    render(<ClassRoute fixture={FIXTURE} classId={FIXTURE.id} />);

    expect(screen.getByRole("button", { name: /Class code/ })).toBeInTheDocument();
  });
});
