import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { useStudentProfile, hydrated } = vi.hoisted(() => ({
  useStudentProfile: vi.fn(),
  hydrated: { value: true },
}));
vi.mock("@/hooks/useStudentProfile", () => ({ useStudentProfile }));
vi.mock("@/hooks/useHydrated", () => ({ useHydrated: () => hydrated.value }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("./LiveStudentProfile", () => ({
  LiveStudentProfile: ({ recommendOpen }: { recommendOpen?: boolean }) => (
    <p>{recommendOpen ? "live profile, recommending" : "live profile"}</p>
  ),
}));
vi.mock("./StudentProfile", () => ({
  StudentProfile: () => <p>sample profile</p>,
}));

import { StudentRoute } from "./StudentRoute";
import { clearSession, setSession } from "@/lib/auth/session";
import type { StudentProfileData } from "@/lib/mocks/teacherStudents";

/**
 * T241. Each branch of the child's profile route is a past bug: a real child
 * answered 404 on a hard load, the recommend route rendered a plain profile,
 * and a failed read put the walkthrough's invented child in front of a real
 * teacher. None of them had a test.
 */

const FIXTURE = { id: "amara-okafor", name: "Amara Okafor" } as unknown as StudentProfileData;

const state = (over: Record<string, unknown> = {}) =>
  useStudentProfile.mockReturnValue({
    profile: null,
    loading: false,
    missing: false,
    failed: false,
    ...over,
  });

const signIn = () =>
  setSession({
    token: "tok",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: "t-1",
    role: "teacher" as never,
  });

const show = (fixture: StudentProfileData | null = FIXTURE, recommendOpen?: boolean) =>
  render(<StudentRoute fixture={fixture} studentId="s-1" recommendOpen={recommendOpen} />);

beforeEach(() => {
  hydrated.value = true;
  clearSession();
  window.localStorage.clear();
  state();
});

describe("before the client is running", () => {
  it("decides nothing - not the profile, not the sample, not a 404", () => {
    // The server cannot read the token, so this used to answer every real
    // child's hard load with "This page doesn't exist".
    hydrated.value = false;
    signIn();
    state({ missing: true });

    expect(() => show()).not.toThrow();
    expect(screen.queryByText(/profile/)).not.toBeInTheDocument();
  });
});

describe("a signed-in teacher", () => {
  beforeEach(signIn);

  it("sees the child's own profile once it has been read", () => {
    state({ profile: { id: "s-1" } });
    show();

    expect(screen.getByText("live profile")).toBeInTheDocument();
  });

  it("reaches Recommend from the recommend route", () => {
    state({ profile: { id: "s-1" } });
    show(FIXTURE, true);

    expect(screen.getByText("live profile, recommending")).toBeInTheDocument();
  });

  it("is shown no sample child while the profile is still being read", () => {
    state({ loading: true });
    show();

    expect(screen.queryByText("sample profile")).not.toBeInTheDocument();
    expect(screen.queryByText(/couldn.t load/)).not.toBeInTheDocument();
  });

  it("is told the read failed, and is shown no sample child in its place", () => {
    state({ failed: true });
    show();

    expect(screen.getByText(/couldn.t load this student/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByText("sample profile")).not.toBeInTheDocument();
  });

  it("is not-found for a child who is not there", () => {
    state({ missing: true });

    expect(() => show()).toThrow("NEXT_NOT_FOUND");
  });
});

describe("a visitor who is not signed in", () => {
  it("walks the designed profile, marked as a sample", () => {
    const { container } = show();

    expect(screen.getByText("sample profile")).toBeInTheDocument();
    expect(container.querySelector("[data-nevo-sample]")).not.toBeNull();
  });

  it("is not-found where there is no designed profile to show", () => {
    expect(() => show(null)).toThrow("NEXT_NOT_FOUND");
  });
});
