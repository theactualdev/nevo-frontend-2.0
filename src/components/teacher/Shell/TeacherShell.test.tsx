import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const { useSessionLapse, usePathname } = vi.hoisted(() => ({
  useSessionLapse: vi.fn(),
  usePathname: vi.fn(),
}));

vi.mock("@/hooks/useSessionLapse", () => ({ useSessionLapse }));
vi.mock("next/navigation", () => ({ usePathname }));
vi.mock("./AskNevo", () => ({ AskNevo: () => null }));
vi.mock("./TeacherSidebar", () => ({ TeacherSidebar: () => null }));

import { TeacherShell } from "./TeacherShell";

/**
 * That the teacher console notices a session running out underneath it.
 *
 * THIS TESTS WIRING, AND THAT IS THE RIGHT LEVEL, because wiring is exactly
 * what was missing. `useSessionLapse` has its own tests
 * (`hooks/useSessionLapse.test.ts`), `sessionExpiredDoor` has its own
 * (`lib/api/client.dom.test.ts`, which pins that a teacher gets
 * `/auth/teacher/session-expired`), and `app/auth/teacher/session-expired`
 * exists and renders. Every piece was built and tested. `StudentShell.tsx:55`
 * called the hook and this shell never did, so a teacher's session lapsed in
 * silence and the door built for them could not be reached by anything.
 *
 * Why silence is the whole cost, from the hook's own docblock: an expired
 * session clears itself, so the app makes no request, so no 401 arrives, so
 * nothing redirects. The route guard runs only on navigation - and a teacher
 * reading one roster does not navigate.
 */

beforeEach(() => {
  useSessionLapse.mockReset();
  usePathname.mockReset();
  usePathname.mockReturnValue("/teacher/dashboard");
});

describe("the teacher console shell", () => {
  it("watches for the teacher's session running out", () => {
    render(
      <TeacherShell>
        <div>console</div>
      </TeacherShell>,
    );

    expect(useSessionLapse).toHaveBeenCalled();
  });

  it("watches on the full-screen flows too, not just the chrome", () => {
    // Onboarding returns early, before the chrome renders. A hook called after
    // that early return would not run here - and would break the rules of
    // hooks besides.
    usePathname.mockReturnValue("/teacher/onboarding");

    render(
      <TeacherShell>
        <div>bare</div>
      </TeacherShell>,
    );

    expect(useSessionLapse).toHaveBeenCalled();
  });

  it("zooms the page by the class the boot script keys, not an inline style (C12)", () => {
    const { container } = render(
      <TeacherShell>
        <div>console</div>
      </TeacherShell>,
    );
    const main = container.querySelector("main");

    expect(main).toHaveClass("nevo-text-zoom");
    expect(main?.style.zoom).toBe("");
  });

  it("still renders what it was given", () => {
    const { getByText } = render(
      <TeacherShell>
        <div>console</div>
      </TeacherShell>,
    );

    expect(getByText("console")).toBeInTheDocument();
  });
});
