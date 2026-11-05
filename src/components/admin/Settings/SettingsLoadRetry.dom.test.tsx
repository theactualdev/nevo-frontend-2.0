import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AccountSettings } from "./AccountSettings";
import { SchoolSettings } from "./SchoolSettings";

/**
 * A failed first read on either Settings page said "Try again in a moment"
 * with nothing to press - the only way back was reloading the page (the 2 Nov
 * audit). Both now ask the read again from a button.
 */

const getSchool = vi.fn();
const me = vi.fn();

vi.mock("@/lib/api/school", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/school")>();
  return { ...actual, schoolApi: { ...actual.schoolApi, get: () => getSchool() } };
});
vi.mock("@/lib/api/users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/users")>();
  return { ...actual, usersApi: { ...actual.usersApi, me: () => me() } };
});
vi.mock("@/lib/api/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/permissions")>();
  return {
    ...actual,
    permissionsApi: { ...actual.permissionsApi, me: async () => ({ scopes: [] }) },
  };
});
vi.mock("@/lib/api/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/auth")>();
  return { ...actual, authApi: { ...actual.authApi, sessions: async () => [] } };
});

const SCHOOL = {
  id: "sch1",
  name: "Brightgate Academy",
  code: "BRG-1",
  retentionPolicy: "contract",
  retentionDays: 365,
  profile: {},
  academicConfig: { yearStart: "2026-09-01", yearEnd: "2027-07-31", terms: [] },
};

const USER = {
  userId: "u1",
  role: "other_admin",
  firstName: "Folake",
  lastName: "Adebayo",
  displayName: "Folake Adebayo",
  email: "f.adebayo@brightgate.edu.ng",
  school: null,
};

// Braced: an arrow that returns the mock has vitest call it as cleanup.
beforeEach(() => {
  getSchool.mockReset();
  me.mockReset();
});

describe("a Settings page whose first read failed", () => {
  it("asks for the school's settings again when Try again is pressed", async () => {
    getSchool.mockRejectedValueOnce(new Error("down")).mockResolvedValue(SCHOOL);
    render(<SchoolSettings />);
    expect(await screen.findByText("We couldn't load your settings")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByDisplayValue("Brightgate Academy")).toBeInTheDocument();
    expect(getSchool).toHaveBeenCalledTimes(2);
  });

  it("asks for the account again when Try again is pressed", async () => {
    me.mockRejectedValueOnce(new Error("down")).mockResolvedValue(USER);
    render(<AccountSettings />);
    expect(await screen.findByText("We couldn't load your account")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByDisplayValue("Folake")).toBeInTheDocument();
    expect(me).toHaveBeenCalledTimes(2);
  });
});
