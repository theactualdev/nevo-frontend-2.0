import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ClassStudent } from "@/lib/api/classes";

const { useClassRoster, useTeacherFlags, useClassLessons, clearPin, requestAdminSupport, show } =
  vi.hoisted(() => ({
    useClassRoster: vi.fn(),
    useTeacherFlags: vi.fn(),
    useClassLessons: vi.fn(),
    clearPin: vi.fn(),
    requestAdminSupport: vi.fn(),
    show: vi.fn(),
  }));

vi.mock("@/lib/api/students", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/students")>();
  return { ...actual, studentsApi: { ...actual.studentsApi, clearPin, requestAdminSupport } };
});
vi.mock("@/hooks/useClassRoster", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClassRoster")>()),
  useClassRoster,
}));
vi.mock("@/hooks/useTeacherFlags", () => ({ useTeacherFlags }));
vi.mock("@/hooks/useClassLessons", () => ({ useClassLessons }));
vi.mock("@/components/shared/SystemMessages", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/shared/SystemMessages")>()),
  useSystemMessages: () => ({ show, resolve: vi.fn(), dismiss: vi.fn() }),
}));

import { LiveClassDetail } from "./LiveClassDetail";

/**
 * WHAT THE ROSTER READ CARRIES SINCE 12 OCT: a child's admission number, a
 * PIN they asked to reset, a PIN that is cleared and still unchosen - server-
 * held, so it survives a reload - and, for a deactivated child, the way to ask
 * an admin about the account (SCRUM-145). C05 draws all four; the C16b card
 * that Lydia kept carries them now.
 */

const row = (over: Partial<ClassStudent> = {}): ClassStudent =>
  ({
    studentId: "s-1",
    firstName: "Amara",
    lastName: "Okafor",
    displayName: "Amara Okafor",
    loginIdentifier: "amara.o",
    admissionNumber: null,
    pinResetRequested: false,
    pinCleared: false,
    pinClearedAt: null,
    status: "active",
    profileStatus: "observed",
    latestSessionAt: "2026-09-14T08:00:00Z",
    observations: [],
    seatContext: "Seat 12",
    consent: null,
    ...over,
  }) as unknown as ClassStudent;

const klass = { classId: "c-1", className: "JSS 2B", classCode: "AB12", role: "primary_teacher" } as never;
const roster = (...students: ClassStudent[]) =>
  useClassRoster.mockReturnValue({ students, loading: false, failed: false });
const flagged = (studentId: string) =>
  useTeacherFlags.mockReturnValue({
    flags: [{ studentId, isSudden: false }],
    live: true,
    failed: false,
  });
const send = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
  });
};

beforeEach(() => {
  clearPin.mockReset().mockResolvedValue({ studentId: "s-1", clearedAt: "2026-10-12T09:00:00Z" });
  requestAdminSupport.mockReset();
  show.mockReset();
  useTeacherFlags.mockReturnValue({ flags: [], live: true, failed: false });
  useClassLessons.mockReturnValue({ lessons: [], loading: false, failed: false });
  roster(row());
});

describe("the admission number", () => {
  it("sits beside the login identifier, since sign-in takes either", () => {
    roster(row({ admissionNumber: "BGA/2107" }));
    render(<LiveClassDetail klass={klass} />);

    expect(screen.getByText(/amara\.o · BGA\/2107 · Seat 12/)).toBeInTheDocument();
  });

  it("is left out where the school has none on file", () => {
    render(<LiveClassDetail klass={klass} />);

    expect(screen.getByText(/amara\.o · Seat 12/)).toBeInTheDocument();
  });

  // Design's reference (30 Sep): "always labelled Student ID / Admission
  // Number, both words, everywhere a person reads it".
  it("is labelled with both words wherever an ID is shown", () => {
    roster(row({ admissionNumber: "BGA/2107" }));
    render(<LiveClassDetail klass={klass} />);

    const label = screen.getByText("Student ID / Admission Number");
    expect(label.parentElement).toHaveTextContent(
      "Student ID / Admission Number amara.o · BGA/2107 · Seat 12",
    );
  });

  it("carries no label over a seat alone, where there is no ID to name", () => {
    roster(row({ loginIdentifier: null, seatContext: "Seat 12" }));
    render(<LiveClassDetail klass={klass} />);

    expect(screen.getByText("Seat 12")).toBeInTheDocument();
    expect(screen.queryByText("Student ID / Admission Number")).not.toBeInTheDocument();
  });
});

describe("a child who asked for a new PIN", () => {
  /*
   * Lydia, 13 Oct: the row says the consequence, Can't sign in, in the chip
   * system's muted treatment - not C05's violet "Forgot PIN", which names a
   * cause nobody knows.
   */
  it("is marked Can't sign in, with Clear PIN out on the row", () => {
    roster(row({ pinResetRequested: true }));
    render(<LiveClassDetail klass={klass} />);

    expect(screen.getByText("Can't sign in")).toBeInTheDocument();
    expect(screen.queryByText("Forgot PIN")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear PIN" })).toBeInTheDocument();
  });

  it("is cleared from the row in one press", async () => {
    roster(row({ pinResetRequested: true }));
    render(<LiveClassDetail klass={klass} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear PIN" }));

    expect(await screen.findByRole("dialog", { name: "Amara’s PIN is cleared" })).toBeInTheDocument();
    expect(clearPin).toHaveBeenCalledWith("s-1");
    expect(screen.queryByText("Can't sign in")).not.toBeInTheDocument();
  });

  it("takes the place of the attention marker, as C05 orders them", () => {
    roster(row({ pinResetRequested: true }));
    flagged("s-1");
    render(<LiveClassDetail klass={klass} />);

    expect(screen.queryByText("Worth a glance")).not.toBeInTheDocument();
  });

  it("is not offered a Clear PIN when nothing was asked", () => {
    render(<LiveClassDetail klass={klass} />);

    expect(screen.queryByText("Can't sign in")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear PIN" })).not.toBeInTheDocument();
  });
});

describe("a PIN that is cleared and not yet chosen", () => {
  it("says so from the server's own word, so it survives a reload", () => {
    roster(row({ pinCleared: true, pinClearedAt: "2026-10-11T09:00:00Z", pinResetRequested: true }));
    render(<LiveClassDetail klass={klass} />);

    expect(screen.getByText(/PIN cleared · new one not chosen yet/)).toBeInTheDocument();
    // The request it answered is not shown twice.
    expect(screen.queryByText("Can't sign in")).not.toBeInTheDocument();
  });
});

describe("a deactivated child", () => {
  const deactivated = () => roster(row({ status: "deactivated", pinResetRequested: true }));
  const openAsk = () => fireEvent.click(screen.getByRole("button", { name: /^Ask an admin/ }));

  it("shows the account state first, and nothing about a PIN", () => {
    deactivated();
    render(<LiveClassDetail klass={klass} />);

    expect(screen.getByText("Deactivated")).toBeInTheDocument();
    expect(screen.queryByText("Can't sign in")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear PIN" })).not.toBeInTheDocument();
  });

  it("offers to ask an admin, with C05's optional note", () => {
    deactivated();
    render(<LiveClassDetail klass={klass} />);
    openAsk();

    const dialog = screen.getByRole("dialog", { name: "Ask an admin about Amara’s account?" });
    expect(dialog).toHaveTextContent(
      "We’ll let your school admin know you’re asking about this account. They’ll follow up with you.",
    );
    const box = within(dialog).getByRole("textbox", { name: "Add a note (optional)" });
    expect(box).toHaveAttribute("placeholder", "Anything that would help the admin");
    expect(box).toHaveAttribute("maxlength", "2000");
  });

  // B-2 (Teslim, 14 Oct): the note goes in the administrators' notification.
  it("sends the note with the request, trimmed", async () => {
    deactivated();
    requestAdminSupport.mockResolvedValue({ studentId: "s-1", status: "notified", notifiedAdminCount: 1 });
    render(<LiveClassDetail klass={klass} />);
    openAsk();
    fireEvent.change(screen.getByRole("textbox", { name: "Add a note (optional)" }), {
      target: { value: "  Her mum called the school on Monday.  " },
    });
    await send();

    expect(requestAdminSupport).toHaveBeenCalledWith("s-1", "Her mum called the school on Monday.");
  });

  it("says the note was not added when an earlier request still stands", async () => {
    deactivated();
    requestAdminSupport.mockResolvedValue({ studentId: "s-1", status: "already_notified", notifiedAdminCount: 0 });
    render(<LiveClassDetail klass={klass} />);
    openAsk();
    fireEvent.change(screen.getByRole("textbox", { name: "Add a note (optional)" }), {
      target: { value: "Anything" },
    });
    await send();

    expect(show).toHaveBeenCalledWith({
      kind: "confirm",
      message: "Your admin was already asked about this account, so your note wasn’t added.",
    });
  });

  // B-3 (Teslim, 14 Oct): the roster says a request is open, so it survives a reload.
  it("shows an open request from the roster read, dated, with no way to ask twice", () => {
    roster(
      row({
        status: "deactivated",
        adminSupportRequestOpen: true,
        adminSupportRequestedAt: "2026-09-12T10:00:00Z",
      }),
    );
    render(<LiveClassDetail klass={klass} />);

    expect(screen.getByText("Request sent").parentElement!.textContent).toMatch(/12 Sep/);
    expect(screen.queryByRole("button", { name: /^Ask an admin/ })).not.toBeInTheDocument();
  });

  it("dates nothing the roster did not date", () => {
    roster(row({ status: "deactivated", adminSupportRequestOpen: true, adminSupportRequestedAt: null }));
    render(<LiveClassDetail klass={klass} />);

    expect(screen.getByText("Request sent").parentElement!.textContent).not.toMatch(/·/);
  });

  it("offers to ask again once every admin has read or archived the last request", () => {
    roster(row({ status: "deactivated", adminSupportRequestOpen: false, adminSupportRequestedAt: null }));
    render(<LiveClassDetail klass={klass} />);

    expect(screen.getByRole("button", { name: /^Ask an admin/ })).toBeInTheDocument();
  });

  it("sends the request, says the admin was told, and marks the row", async () => {
    deactivated();
    requestAdminSupport.mockResolvedValue({ studentId: "s-1", status: "notified", notifiedAdminCount: 2 });
    render(<LiveClassDetail klass={klass} />);
    openAsk();
    await send();

    expect(requestAdminSupport).toHaveBeenCalledWith("s-1");
    expect(show).toHaveBeenCalledWith({ kind: "confirm", message: "Your admin has been notified." });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Request sent")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Ask an admin/ })).not.toBeInTheDocument();
  });

  it("dates nothing it does not know, when an earlier request stood", async () => {
    deactivated();
    requestAdminSupport.mockResolvedValue({
      studentId: "s-1",
      status: "already_notified",
      notifiedAdminCount: 0,
    });
    render(<LiveClassDetail klass={klass} />);
    openAsk();
    await send();

    expect(screen.getByText("Request sent").parentElement!.textContent).not.toMatch(/·/);
    expect(show).toHaveBeenCalled();
  });

  it("claims nothing when no admin could be told", async () => {
    deactivated();
    requestAdminSupport.mockResolvedValue({ studentId: "s-1", status: "notified", notifiedAdminCount: 0 });
    render(<LiveClassDetail klass={klass} />);
    openAsk();
    await send();

    expect(screen.getByRole("alert")).toHaveTextContent("nobody has been asked");
    expect(show).not.toHaveBeenCalled();
    expect(screen.queryByText("Request sent")).not.toBeInTheDocument();
  });

  it("says so when the request failed, and claims nothing", async () => {
    deactivated();
    requestAdminSupport.mockRejectedValue(new Error("500"));
    render(<LiveClassDetail klass={klass} />);
    openAsk();
    await send();

    expect(screen.getByRole("alert")).toHaveTextContent("Nothing has been sent");
    expect(show).not.toHaveBeenCalled();
  });

  it("is reachable from the menu's explanation too", () => {
    deactivated();
    render(<LiveClassDetail klass={klass} />);
    fireEvent.click(screen.getByRole("button", { name: "More options for Amara" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Clear PIN" }));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("button", { name: "Ask an admin about this" }));

    expect(screen.getByRole("dialog", { name: "Ask an admin about Amara’s account?" })).toBeInTheDocument();
  });
});
