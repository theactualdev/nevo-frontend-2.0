import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, renderHook, waitFor } from "@testing-library/react";
import { DEFAULT_AVATAR_LOOK, avatarLookOf } from "@/lib/profile/avatarLook";
import { lookOfChild } from "@/lib/profile/rosterLook";

const classStudents = vi.fn();
vi.mock("@/lib/api/classes", () => ({
  classesApi: { classStudents: (id: string) => classStudents(id) },
}));

import { ChildAvatar, useChildLook } from "./ChildAvatar";

/**
 * A CHILD'S AVATAR ON AN ADMIN SCREEN (SCRUM-324; Lydia's 928cf30 build list):
 * their shape in their tone from the one `StudentAvatar`, never their
 * initials. The look is read in the hub's interim order - `avatarTone` when it
 * holds a chosen look, then `avatarShape` + `avatarColourway`, then the
 * nothing-chosen navy circle - and a screen that hasn't been told the look
 * draws a plain tile, not a guessed one.
 */

beforeEach(() => {
  classStudents.mockReset();
});

describe("lookOfChild, the interim order", () => {
  it("takes a look kept in avatarTone first", () => {
    expect(
      lookOfChild({ avatarTone: "star-near_black", avatarShape: "hexagon", avatarColourway: "navy" }).id,
    ).toBe("star-near_black");
  });

  it("falls back to the server's shape and colourway when the tone holds no look", () => {
    expect(lookOfChild({ avatarTone: "navy", avatarShape: "diamond", avatarColourway: "cream_elevated" })).toEqual(
      avatarLookOf("diamond", "cream_elevated"),
    );
    expect(lookOfChild({ avatarTone: null, avatarShape: "triangle", avatarColourway: "navy" }).id).toBe(
      "triangle-navy",
    );
  });

  it("is the nothing-chosen look when nothing is set, or only half of it", () => {
    expect(lookOfChild({})).toBe(DEFAULT_AVATAR_LOOK);
    expect(lookOfChild({ avatarShape: "star", avatarColourway: null })).toBe(DEFAULT_AVATAR_LOOK);
    expect(lookOfChild({ avatarShape: "pill", avatarColourway: "navy" })).toBe(DEFAULT_AVATAR_LOOK);
  });
});

describe("ChildAvatar", () => {
  it("draws the child's shape in their tone, and no initials", () => {
    const { container } = render(<ChildAvatar look={avatarLookOf("star", "near_black")} size={34} />);
    expect(container.querySelector('[data-avatar-look="star-near_black"]')).not.toBeNull();
    expect(container.querySelector('[data-avatar-shape="star"]')).not.toBeNull();
    expect(container.textContent).toBe("");
  });

  it("with no look known, draws a plain tile that claims none - not the navy circle", () => {
    const { container } = render(<ChildAvatar look={null} size={56} />);
    expect(container.querySelector('[data-avatar-look="unknown"]')).not.toBeNull();
    expect(container.querySelector("[data-avatar-shape]")).toBeNull();
  });
});

describe("useChildLook, for a record page", () => {
  it("reads the child's look from their class roster", async () => {
    classStudents.mockResolvedValue([
      { studentId: "s-2", avatarShape: "circle", avatarColourway: "navy" },
      { studentId: "s-1", avatarShape: "hexagon", avatarColourway: "near_black" },
    ]);
    const { result } = renderHook(() => useChildLook("s-1", ["c-1"]));
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current?.id).toBe("hexagon-near_black"));
    expect(classStudents).toHaveBeenCalledWith("c-1");
  });

  it("stays unknown for a child in no class, a child not on the roster, and a failed read", async () => {
    const none = renderHook(() => useChildLook("s-1", []));
    expect(none.result.current).toBeNull();
    expect(classStudents).not.toHaveBeenCalled();

    classStudents.mockResolvedValueOnce([{ studentId: "s-9" }]);
    const missing = renderHook(() => useChildLook("s-1", ["c-1"]));
    await waitFor(() => expect(classStudents).toHaveBeenCalledTimes(1));
    expect(missing.result.current).toBeNull();

    classStudents.mockRejectedValueOnce(new Error("offline"));
    const failed = renderHook(() => useChildLook("s-1", ["c-2"]));
    await waitFor(() => expect(classStudents).toHaveBeenCalledTimes(2));
    expect(failed.result.current).toBeNull();
  });
});
