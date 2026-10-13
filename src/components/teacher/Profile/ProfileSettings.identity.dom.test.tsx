import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { identityState } = vi.hoisted(() => ({
  identityState: { value: { identity: null as unknown, status: "loading" } },
}));
vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));
vi.mock("@/hooks/useCurrentUser", () => ({
  useCurrentUserStatus: () => identityState.value,
  publishIdentity: vi.fn(),
  uploadPhoto: vi.fn(),
}));
vi.mock("@/hooks/useTeacherSettings", () => ({
  useTeacherSettings: () => ({ values: {}, set: vi.fn(), save: vi.fn(), loading: false }),
}));
vi.mock("@/context/AccessibilityContext", () => ({
  useAccessibility: () => ({ preferences: {}, update: vi.fn(), setPreference: vi.fn() }),
}));

import { ProfileSettings } from "./ProfileSettings";

/**
 * The profile header while the teacher's details are loading, and after the
 * read fails. Both rendered "Teacher" and "Your details aren't connected yet"
 * - a claim about the account, made over our own read.
 */

const NOT_CONNECTED = /details aren.t connected yet/;

describe("while the details are loading", () => {
  beforeEach(() => {
    identityState.value = { identity: null, status: "loading" };
  });

  it("claims nothing about the account", () => {
    render(<ProfileSettings />);

    expect(screen.queryByText("Teacher")).not.toBeInTheDocument();
    expect(screen.queryByText(NOT_CONNECTED)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Loading your details")).toBeInTheDocument();
  });
});

describe("when the details could not be read", () => {
  beforeEach(() => {
    identityState.value = { identity: null, status: "failed" };
  });

  it("says the read failed, not that the account is unconnected", () => {
    render(<ProfileSettings />);

    expect(screen.getByText(/couldn.t load your details just now/)).toBeInTheDocument();
    expect(screen.queryByText(NOT_CONNECTED)).not.toBeInTheDocument();
    expect(screen.queryByText("Teacher")).not.toBeInTheDocument();
  });
});

describe("once the details are in", () => {
  it("shows the teacher's own name", () => {
    identityState.value = {
      identity: {
        name: "Ola Bello",
        initials: "OB",
        email: "ola@school.ng",
        school: null,
        subjects: [],
        photoUrl: null,
        role: "teacher",
      },
      status: "ready",
    };
    render(<ProfileSettings />);

    expect(screen.getByText("Ola Bello")).toBeInTheDocument();
    expect(screen.queryByLabelText("Loading your details")).not.toBeInTheDocument();
  });
});
