import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api/client";
import type { LearningSupportHolders } from "@/lib/api/learningSupport";

const { grant, remove } = vi.hoisted(() => ({ grant: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/api/learningSupport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/learningSupport")>();
  return { ...actual, learningSupportApi: { ...actual.learningSupportApi, grant, remove } };
});

import { LearningSupportRecord } from "./LearningSupportRecord";

/**
 * SCRUM-247 (Olayinka, 12 Oct): Learning Support on a person's record -
 * whether they hold it, who gave it and when; Give and Remove on anyone but
 * yourself; the last holder's refusal said as what happened and what to do.
 */

const ADA = { userId: "u-ada", name: "Ada Obi" };
const held = (grantedBy: string): LearningSupportHolders => ({
  holders: [{ userId: "u-ada", name: "Ada Obi", role: "other_admin", grantedAt: "2026-10-03T09:00:00Z", grantedBy }],
  viewerHoldsIt: false,
});
const nobody: LearningSupportHolders = { holders: [], viewerHoldsIt: false };
const names: Record<string, string> = { "u-bisi": "Bisi Adebayo" };
const nameOf = (id: string) => names[id] ?? null;

const show = (props: Partial<Parameters<typeof LearningSupportRecord>[0]> = {}) => {
  const onChange = vi.fn();
  render(
    <LearningSupportRecord
      person={ADA}
      holders={nobody}
      you={false}
      me="u-me"
      nameOf={nameOf}
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

describe("the record", () => {
  it("says who gave it and when", () => {
    show({ holders: held("u-bisi") });
    expect(screen.getByText(/Given by Bisi Adebayo on 3 October 2026/)).toBeInTheDocument();
  });

  it("says you, when you gave it", () => {
    show({ holders: held("u-me") });
    expect(screen.getByText(/Given by you on 3 October 2026/)).toBeInTheDocument();
  });

  it("keeps the date and names nobody when the granter can't be named", () => {
    show({ holders: held("u-gone") });
    expect(screen.getByText(/Given on 3 October 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/Given by/)).toBeNull();
  });

  it("says so when they don't hold it", () => {
    show();
    expect(screen.getByText(/No Learning Support/)).toBeInTheDocument();
  });
});

describe("no self-granting", () => {
  it("offers nothing on your own record, and says who can give it", () => {
    show({ you: true });
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/Another administrator can give it to you/)).toBeInTheDocument();
  });

  it("offers no removal on your own record either", () => {
    show({ you: true, holders: held("u-bisi") });
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("giving it", () => {
  it("asks first, then sends the person's id and shows the list the server returns", async () => {
    const after = held("u-me");
    grant.mockResolvedValue(after);
    const onChange = show();

    fireEvent.click(screen.getByRole("button", { name: "Give Learning Support" }));
    expect(grant).not.toHaveBeenCalled();
    expect(screen.getByText(/recorded with your name and today.s date/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Give Learning Support" }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(after));
    expect(grant).toHaveBeenCalledWith("u-ada");
  });

  it("does nothing on Cancel", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Give Learning Support" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(grant).not.toHaveBeenCalled();
  });

  it("is not offered where it can't be given", () => {
    show({ canGive: false });
    expect(screen.queryByRole("button", { name: /Give Learning Support/ })).toBeNull();
  });
});

describe("removing it", () => {
  it("refuses the last holder in a sentence that says what to do", async () => {
    remove.mockRejectedValue(new ApiError(409, "Conflict", { detail: { code: "x", message: "y" } }));
    const onChange = show({ holders: held("u-bisi") });

    fireEvent.click(screen.getByRole("button", { name: "Remove Learning Support" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Learning Support" }));

    expect(
      await screen.findByText(
        "Ada Obi is the only person in your school with Learning Support, so it can't be removed. Give Learning Support to someone else first, then remove it from Ada Obi.",
      ),
    ).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows the server's own reason for any other refusal", async () => {
    remove.mockRejectedValue(
      new ApiError(403, "Forbidden", { detail: { code: "nope", message: "Only an administrator can do that." } }),
    );
    show({ holders: held("u-bisi") });
    fireEvent.click(screen.getByRole("button", { name: "Remove Learning Support" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Learning Support" }));
    expect(await screen.findByText("Only an administrator can do that.")).toBeInTheDocument();
  });

  it("keeps it on Keep", () => {
    show({ holders: held("u-bisi") });
    fireEvent.click(screen.getByRole("button", { name: "Remove Learning Support" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(remove).not.toHaveBeenCalled();
  });
});
