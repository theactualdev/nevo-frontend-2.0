import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/api/escalations", () => ({ escalationsApi: { create } }));
// Added when the session panel gave this profile its first navigation. Without
// it every test here dies on "invariant expected app router to be mounted".
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
// The sessions list loads with the profile; these tests are about the share
// sheet, so it stays empty rather than adding rows they would have to ignore.
vi.mock("@/hooks/useStudentSessions", () => ({
  useStudentSessions: () => ({ sessions: [], total: 0, loading: false, failed: false }),
  useStudentSession: () => ({ detail: null, loading: false, failed: false }),
}));

import { LiveStudentProfile } from "./LiveStudentProfile";
import { SystemMessagesProvider } from "@/components/shared/SystemMessages";
import type { StudentProfileState } from "@/hooks/useStudentProfile";

/**
 * C14 B5 on the live student profile: the sheet dismisses, a toast confirms,
 * and a quiet note settles under the student's name.
 *
 * WHY THIS FILE EXISTS SEPARATELY from the sheet's own tests. The sheet can be
 * perfectly correct and this screen still lie, because the claim a teacher
 * actually reads - "Shared with Learning Support" under a child's name - is
 * rendered HERE, from state this component owns. The defect being guarded is
 * precisely that split: an earlier version of this screen showed the toast and
 * the note over a handler that posted nothing.
 *
 * The state is built to the HOOK's shape, not the wire's. `useStudentProfile`
 * returns a shaped object, and mocking the raw payload instead is how an
 * earlier test in this console crashed on `.map` of something that was never
 * an array.
 */

const STATE: StudentProfileState = {
  profile: {
    student: { id: "s-1", firstName: "Amara", lastName: "Okafor", ageBand: "11 to 12" },
    profile: null,
    openFlagCount: 0,
  },
  concepts: [],
  helpSeeking: "",
  recommendations: [],
  adaptations: [],
  sessions: [],
  accommodations: null,
  observed: true,
  loading: false,
  missing: false,
  failed: false,
};

const openSheet = () =>
  fireEvent.click(screen.getByRole("button", { name: "Share with Learning Support" }));

// C.8c: the form's button opens the confirm step, and "Yes, send" posts.
const send = () => {
  fireEvent.click(screen.getByRole("button", { name: "Send to Learning Support" }));
  fireEvent.click(screen.getByRole("button", { name: "Yes, send" }));
};

const note = (text: string) =>
  fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });

const SHARED = /Shared with Learning Support/;

beforeEach(() => {
  create.mockReset();
  create.mockResolvedValue({ id: "e-1" });
});

describe("the quiet note", () => {
  it("is absent before a teacher has shared anything", () => {
    render(<LiveStudentProfile studentId="s-1" state={STATE} />);

    // The action is offered; the claim is not made.
    expect(
      screen.getByRole("button", { name: "Share with Learning Support" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(SHARED)).not.toBeInTheDocument();
  });

  it("appears once the escalation is stored, with the confirmation", async () => {
    // C14 B5's toast is the shared bar (frame 43), so the real bar is mounted.
    render(
      <SystemMessagesProvider>
        <LiveStudentProfile studentId="s-1" state={STATE} />
      </SystemMessagesProvider>,
    );
    openSheet();
    note("She has gone very quiet in group work.");
    send();

    expect(await screen.findByText(SHARED)).toBeInTheDocument();
    expect(screen.getByText("Sent to Learning Support. They’ll take it from here.")).toBeInTheDocument();
    // C14 B5: it dismisses.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is NOT shown when the send failed", async () => {
    create.mockRejectedValueOnce(new Error("500"));
    render(<LiveStudentProfile studentId="s-1" state={STATE} />);
    openSheet();
    note("Please take a look.");
    send();

    await screen.findByRole("alert");
    expect(screen.queryByText(SHARED)).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    // The sheet stays open, holding the teacher's words.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("carries no dash, per the 15 Sep copy ruling", async () => {
    render(<LiveStudentProfile studentId="s-1" state={STATE} />);
    openSheet();
    note("A note.");
    send();

    const line = await screen.findByText(SHARED);
    expect(line.textContent).not.toMatch(/[-–—]/);
  });
});

describe("the sheet, from this screen", () => {
  it("sends about THIS student, not a fixture", () => {
    render(<LiveStudentProfile studentId="s-1" state={STATE} />);
    openSheet();
    note("Something is worrying me.");
    send();

    expect(create).toHaveBeenCalledWith({
      studentId: "s-1",
      note: "Something is worrying me.",
    });
  });

  it("closes without sending when cancelled", () => {
    render(<LiveStudentProfile studentId="s-1" state={STATE} />);
    openSheet();
    note("Half a thought.");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(create).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText(SHARED)).not.toBeInTheDocument();
  });
});
