import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const { useSessionLapse, useSessionRefresh, useSessionElsewhere, usePathname } = vi.hoisted(
  () => ({
    useSessionLapse: vi.fn(),
    useSessionRefresh: vi.fn(),
    useSessionElsewhere: vi.fn(),
    usePathname: vi.fn(),
  }),
);

vi.mock("@/hooks/useSessionLapse", () => ({ useSessionLapse }));
vi.mock("@/hooks/useSessionRefresh", () => ({ useSessionRefresh }));
vi.mock("./sessionElsewhere", () => ({ useSessionElsewhere }));
// The shell holds C18's leave confirmation, which navigates with the router.
vi.mock("next/navigation", () => ({
  usePathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
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
  useSessionRefresh.mockReset();
  useSessionElsewhere.mockReset();
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

  it("renews the teacher's session, which only the student shell ever did (T219)", () => {
    render(
      <TeacherShell>
        <div>console</div>
      </TeacherShell>,
    );

    expect(useSessionRefresh).toHaveBeenCalled();
  });

  it("leaves when another tab signs the teacher out (C02)", () => {
    render(
      <TeacherShell>
        <div>console</div>
      </TeacherShell>,
    );

    expect(useSessionElsewhere).toHaveBeenCalled();
  });

  it("does both on the full-screen flows too, above the early return", () => {
    usePathname.mockReturnValue("/teacher/onboarding");
    render(
      <TeacherShell>
        <div>bare</div>
      </TeacherShell>,
    );

    expect(useSessionRefresh).toHaveBeenCalled();
    expect(useSessionElsewhere).toHaveBeenCalled();
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

/**
 * C19 (design, 12 Oct): on a phone, a screen with no phone layout shows the
 * shared "needs a bigger screen" state in its place. CSS decides the width;
 * these pin which screens carry the swap at all.
 */
describe("the console on a phone", () => {
  it("stands the bigger-screen state in for a screen with no phone layout", () => {
    usePathname.mockReturnValue("/teacher/insights");
    const { getByText, getByRole } = render(
      <TeacherShell>
        <div>insights</div>
      </TeacherShell>,
    );

    expect(getByRole("heading", { name: "This page needs a bigger screen" })).toBeInTheDocument();
    // The page is still there for a tablet or a computer - hidden below md.
    expect(getByText("insights").parentElement?.className).toMatch(/max-md:hidden/);
  });

  it("gives a phone the screen itself where one is drawn", () => {
    usePathname.mockReturnValue("/teacher/dashboard");
    const { getByText, queryByRole } = render(
      <TeacherShell>
        <div>home</div>
      </TeacherShell>,
    );

    expect(queryByRole("heading", { name: "This page needs a bigger screen" })).not.toBeInTheDocument();
    expect(getByText("home").parentElement?.className ?? "").not.toMatch(/max-md:hidden/);
  });
});
