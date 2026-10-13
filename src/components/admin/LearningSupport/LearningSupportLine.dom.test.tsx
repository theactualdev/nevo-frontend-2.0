import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";
import type { LearningSupportHolders } from "@/lib/api/learningSupport";

const { grant, remove } = vi.hoisted(() => ({ grant: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/api/learningSupport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/learningSupport")>();
  return { ...actual, learningSupportApi: { ...actual.learningSupportApi, grant, remove } };
});

import { LearningSupportLine } from "./LearningSupportLine";

/**
 * D03b (design 9d0ff6b, 12 Oct): Learning Support is one permission line on a
 * person's record - a toggle, "Granted by {name} · {date}" when held, no
 * confirm step; status only on your own record; and a calm dialog when the
 * school's last holder would be removed.
 */

const GRACE = { userId: "u-grace", name: "Grace Eze" };
const THIS_YEAR = new Date().getFullYear();
const held = (over: Record<string, unknown> = {}): LearningSupportHolders => ({
  holders: [
    {
      userId: "u-grace",
      name: "Grace Eze",
      role: "other_admin",
      grantedAt: `${THIS_YEAR}-10-12T09:00:00Z`,
      grantedBy: "u-folake",
      grantedByName: "Folake Adebayo",
      ...over,
    },
  ],
  viewerHoldsIt: true,
});
const nobody: LearningSupportHolders = { holders: [], viewerHoldsIt: true };

const show = (props: Partial<Parameters<typeof LearningSupportLine>[0]> = {}) => {
  const onChange = vi.fn();
  render(
    <LearningSupportLine
      person={GRACE}
      holders={nobody}
      you={false}
      me="u-folake"
      canGive
      canRemove
      onChange={onChange}
      {...props}
    />,
  );
  return onChange;
};

beforeEach(() => {
  grant.mockReset();
  remove.mockReset();
});

describe("the permission line", () => {
  it("is a toggle, on, with who granted it and when", () => {
    show({ holders: held() });
    expect(screen.getByRole("switch", { name: /Learning Support/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Granted by Folake Adebayo · 12 October")).toBeInTheDocument();
  });

  it("keeps the date when the granter has no name, and names nobody", () => {
    show({ holders: held({ grantedByName: null, grantedBy: "u-gone" }) });
    expect(screen.getByText("Granted 12 October")).toBeInTheDocument();
  });

  it("names the year only when it isn't this one", () => {
    show({ holders: held({ grantedAt: "2025-10-12T09:00:00Z" }) });
    expect(screen.getByText("Granted by Folake Adebayo · 12 October 2025")).toBeInTheDocument();
  });

  it("is a toggle, off, when they don't hold it", () => {
    show();
    expect(screen.getByRole("switch", { name: /Learning Support/ })).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByText(/Granted/)).toBeNull();
  });
});

describe("toggling it", () => {
  it("grants at once - no confirm step - and shows the server's list", async () => {
    const after = held();
    grant.mockResolvedValue(after);
    const onChange = show();
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(after));
    expect(grant).toHaveBeenCalledWith("u-grace");
  });

  it("removes at once", async () => {
    remove.mockResolvedValue(nobody);
    const onChange = show({ holders: held() });
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(nobody));
    expect(remove).toHaveBeenCalledWith("u-grace");
  });

  it("can't be switched where it can't be given", () => {
    show({ canGive: false });
    expect(screen.getByRole("switch")).toBeDisabled();
  });
});

describe("the school's last holder", () => {
  it("is refused with D03b's calm dialog, which names them and closes", async () => {
    remove.mockRejectedValue(
      new ApiError(409, "Conflict", {
        detail: { code: "last_learning_support_holder", message: "Grant Learning Support to another person before removing the final holder." },
      }),
    );
    const onChange = show({ holders: held() });
    fireEvent.click(screen.getByRole("switch"));

    const dialog = await screen.findByRole("dialog", { name: "Someone needs to hold Learning Support" });
    expect(dialog).toHaveTextContent(
      "Grace Eze is the only person in your school with Learning Support right now. Give it to someone else first, then you can remove it here.",
    );
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    // Still held: nothing changed.
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  it("closes on Escape too", async () => {
    remove.mockRejectedValue(new ApiError(409, "Conflict"));
    show({ holders: held() });
    fireEvent.click(screen.getByRole("switch"));
    await screen.findByRole("dialog");
    // The dialog listens for Escape from the same effect that focuses Close.
    // On a loaded CI runner the dialog can be in the DOM before that effect
    // has run, so wait for the focus before pressing the key.
    await waitFor(() => expect(screen.getByRole("button", { name: "Close" })).toHaveFocus());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the server's own reason for any other refusal", async () => {
    remove.mockRejectedValue(
      new ApiError(403, "Forbidden", { detail: { code: "nope", message: "Only an administrator can do that." } }),
    );
    show({ holders: held() });
    fireEvent.click(screen.getByRole("switch"));
    expect(await screen.findByText("Only an administrator can do that.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("your own record", () => {
  it("says it's held, and offers nothing to press", () => {
    show({ you: true, holders: held() });
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Held")).toBeInTheDocument();
    expect(
      screen.getByText("Another administrator manages this. You can't grant Learning Support to yourself."),
    ).toBeInTheDocument();
  });

  it("says it's not held, and who can grant it", () => {
    show({ you: true });
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.getByText("Not held")).toBeInTheDocument();
    expect(screen.getByText("Another administrator can grant you Learning Support.")).toBeInTheDocument();
  });
});

describe("a self-grant the server refuses", () => {
  it("says who can give it, should one ever be attempted", async () => {
    grant.mockRejectedValue(
      new ApiError(403, "Forbidden", {
        detail: { code: "learning_support_self_grant_forbidden", message: "…" },
      }),
    );
    show();
    fireEvent.click(screen.getByRole("switch"));
    expect(
      await screen.findByText("Learning Support has to be given by another administrator."),
    ).toBeInTheDocument();
  });
});
