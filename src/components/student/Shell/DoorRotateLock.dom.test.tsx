import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DoorRotateLock, isStudentDoor } from "./DoorRotateLock";

/**
 * D65, 6 Oct: "Yes, the rotate prompt covers the sign-in screens. The door and
 * the app behave the same way." The prompt was mounted only by the student
 * layout, and the doors live under `/auth`, which the staff doors share - so a
 * child turning the tablet at sign-in met no prompt, and a minute later did.
 */

const path = vi.hoisted(() => ({ current: "/auth/login" }));
vi.mock("next/navigation", () => ({ usePathname: () => path.current }));

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

const prompt = () => screen.queryByText("Turn your tablet upright");

describe("which doors are a child's", () => {
  it("names every student door under /auth", () => {
    for (const door of [
      "/auth/login",
      "/auth/sign-in",
      "/auth/forgot-pin",
      "/auth/sso-callback",
      "/auth/session-expired",
      "/auth/session-ended",
      "/auth/login/",
    ]) {
      expect(isStudentDoor(door), door).toBe(true);
    }
  });

  it("leaves the staff doors out, which have no rotate prompt anywhere", () => {
    for (const door of [
      "/auth/teacher",
      "/auth/teacher/sso-callback",
      "/auth/teacher/session-expired",
      "/auth/admin",
      "/auth/admin/session-expired",
      "/auth/forgot-password",
      null,
    ]) {
      expect(isStudentDoor(door), String(door)).toBe(false);
    }
  });
});

describe("DoorRotateLock", () => {
  it("puts the rotate prompt over a child's sign-in door", () => {
    path.current = "/auth/login";
    render(
      <DoorRotateLock>
        <main>Who&apos;s learning?</main>
      </DoorRotateLock>,
    );

    expect(prompt()).not.toBeNull();
    expect(screen.getByText("Who's learning?")).toBeInTheDocument();
  });

  it("draws no box of its own around the door, so its layout is unchanged", () => {
    path.current = "/auth/sign-in";
    render(
      <DoorRotateLock>
        <main>00c</main>
      </DoorRotateLock>,
    );

    expect(screen.getByText("00c").parentElement).toHaveClass("contents");
  });

  it("leaves a teacher's door as it was", () => {
    path.current = "/auth/teacher";
    render(
      <DoorRotateLock>
        <main>Teacher sign in</main>
      </DoorRotateLock>,
    );

    expect(prompt()).toBeNull();
    expect(screen.getByText("Teacher sign in")).toBeInTheDocument();
  });
});
