import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { visibleText } from "@/test/visibleText";
import { AccountSettings } from "./AccountSettings";

/**
 * SCRUM-99 D12.7 and D12.6 on Settings -> You: a Show per password field, the
 * requirement before typing and a running count after, the mismatch on blur,
 * a save held until the two new ones match - and Language as a read-only
 * field naming English, with its scope stated.
 */

const changePassword = vi.fn();

vi.mock("@/lib/api/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/auth")>();
  return {
    ...actual,
    authApi: {
      ...actual.authApi,
      sessions: async () => [{ id: "s1", current: true, lastSeenAt: "2026-09-15T09:00:00Z" }],
      changePassword: (p: unknown) => changePassword(p),
    },
  };
});
vi.mock("@/lib/api/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/permissions")>();
  return { ...actual, permissionsApi: { ...actual.permissionsApi, me: async () => ({ scopes: [] }) } };
});
vi.mock("@/lib/api/users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/users")>();
  return {
    ...actual,
    usersApi: {
      ...actual.usersApi,
      me: async () => ({
        id: "u1",
        email: "head@brightgate.edu.ng",
        firstName: "Folake",
        lastName: "Adebayo",
        displayName: "Folake Adebayo",
        role: "admin",
      }),
    },
  };
});

const field = (id: string) => document.getElementById(id) as HTMLInputElement;

beforeEach(() => {
  vi.clearAllMocks();
  changePassword.mockResolvedValue(undefined);
});

describe("changing a password", () => {
  it("shows one field at a time", async () => {
    render(<AccountSettings />);
    await screen.findByLabelText("New password");
    fireEvent.click(screen.getByRole("button", { name: "Show new password" }));
    expect(field("pw-new").type).toBe("text");
    expect(field("pw-current").type).toBe("password");
    expect(field("pw-confirm").type).toBe("password");
  });

  it("states the requirement before typing, then counts", async () => {
    const { container } = render(<AccountSettings />);
    await screen.findByLabelText("New password");
    expect(visibleText(container)).toMatch(
      /At least 10 characters\. A phrase you'll remember is stronger than a short jumble\./,
    );
    fireEvent.change(field("pw-new"), { target: { value: "abcdef" } });
    expect(visibleText(container)).toMatch(/A few more characters: 4 to go\./);
    fireEvent.change(field("pw-new"), { target: { value: "a long enough phrase" } });
    expect(visibleText(container)).toMatch(/That's long enough\./);
  });

  it("says the two don't match on blur, and holds the save until they do", async () => {
    const { container } = render(<AccountSettings />);
    await screen.findByLabelText("New password");
    fireEvent.change(field("pw-current"), { target: { value: "old-password-1" } });
    fireEvent.change(field("pw-new"), { target: { value: "a long enough phrase" } });
    fireEvent.change(field("pw-confirm"), { target: { value: "a long enough phras" } });
    expect(visibleText(container)).not.toMatch(/don.t match yet/);
    fireEvent.blur(field("pw-confirm"));
    expect(visibleText(container)).toMatch(/These two don.t match yet\./);
    expect(screen.getByRole("button", { name: "Change password" })).toBeDisabled();

    fireEvent.change(field("pw-confirm"), { target: { value: "a long enough phrase" } });
    expect(visibleText(container)).not.toMatch(/don.t match yet/);
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));
    await waitFor(() => expect(changePassword).toHaveBeenCalled());
  });
});

describe("language", () => {
  it("names English read-only, and says whose Nevo it changes", async () => {
    const { container } = render(<AccountSettings />);
    const english = await screen.findByRole("button", { name: "English" });
    expect(visibleText(container)).toMatch(
      /This changes Nevo for you only\. Your teachers and students keep their own setting\./,
    );
    fireEvent.click(english);
    expect(visibleText(container)).toMatch(/English is the only language available today/);
    expect(screen.queryByRole("combobox", { name: /language/i })).toBeNull();
  });
});
