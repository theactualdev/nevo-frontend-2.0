import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { TeacherJoin } from "./TeacherJoin";
import { nextStepAfterName } from "./NameAndAgeStep";
import {
  clearOnboardingDraft,
  getOnboardingDraft,
  mergeOnboardingDraft,
} from "@/lib/auth/onboarding";
import { clearSession, getToken, setSession } from "@/lib/auth/session";
import { ApiError } from "@/lib/api/client";

/**
 * Teacher Join never joined anything.
 *
 * It compared what a child typed against a literal `"MAP4KZ"` and called no
 * API at all. The comment defending that said
 * `POST /api/v1/connections/class-code` was Bearer-only and therefore
 * unreachable before a session exists - but the deployed spec gives that
 * operation `security: []`. It is public, and always was for this flow, so
 * every real class code has been failing against a hardcoded demo string.
 *
 * The second half of the same wall was the routing: a child who joined by code
 * was still sent to the school-code screen, and then to a class step that
 * offers invented class names whenever `draft.schoolCode` is unset - which is
 * exactly the state Teacher Join left them in, since it wrote nothing.
 */

const { connectClassCode, push, params } = vi.hoisted(() => ({
  connectClassCode: vi.fn(),
  push: vi.fn(),
  params: new URLSearchParams("mode=code"),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back: vi.fn() }),
  useSearchParams: () => params,
}));
vi.mock("@/lib/api/auth", () => ({ authApi: { connectClassCode } }));

const signOut = vi.hoisted(() => vi.fn());
vi.mock("@/hooks", () => ({ useAuth: () => ({ signOut }) }));

const connection = {
  classId: "class-uuid-1",
  status: "connected",
  schoolCode: "751A1136",
  onboardingToken: "tok-onboard",
  expiresAt: new Date(Date.now() + 20 * 60_000).toISOString(),
};

const type = (code: string) =>
  fireEvent.change(screen.getByLabelText("Class code"), {
    target: { value: code },
  });

beforeEach(() => {
  vi.clearAllMocks();
  clearOnboardingDraft();
  [...params.keys()].forEach((k) => params.delete(k));
  params.set("mode", "code");
});

afterEach(() => {
  cleanup();
  clearOnboardingDraft();
});

describe("TeacherJoin", () => {
  it("checks the code against the roster instead of a hardcoded string", async () => {
    connectClassCode.mockResolvedValue(connection);
    render(<TeacherJoin />);

    type("MAP4KZ99");
    fireEvent.click(screen.getByRole("button", { name: /join my class/i }));

    await waitFor(() => expect(connectClassCode).toHaveBeenCalled());
    expect(connectClassCode).toHaveBeenCalledWith({ classCode: "MAP4KZ99" });
  });

  it("accepts a code longer than the six boxes it used to draw", async () => {
    // `ClassCodeConnectionRequest` is minLength 4, maxLength 20. Six was the
    // same fixed-length guess that made the school screen a wall.
    connectClassCode.mockResolvedValue(connection);
    render(<TeacherJoin />);

    type("SPRINGFIELD-Y4-01");
    fireEvent.click(screen.getByRole("button", { name: /join my class/i }));

    await waitFor(() => expect(connectClassCode).toHaveBeenCalled());
    expect(connectClassCode).toHaveBeenCalledWith({
      classCode: "SPRINGFIELD-Y4-01",
    });
  });

  it("writes the class it resolved into the draft", async () => {
    connectClassCode.mockResolvedValue(connection);
    render(<TeacherJoin />);

    type("MAP4KZ");
    fireEvent.click(screen.getByRole("button", { name: /join my class/i }));

    await waitFor(() =>
      expect(getOnboardingDraft().classId).toBe("class-uuid-1"),
    );
    expect(getOnboardingDraft().schoolCode).toBe("751A1136");
    // The code itself too: `schoolCode` is nullable on this response, and
    // `{ classCode }` alone is a form the connect endpoint accepts.
    expect(getOnboardingDraft().classCode).toBe("MAP4KZ");
  });

  it("still records the class when the response carries no school code", async () => {
    connectClassCode.mockResolvedValue({ ...connection, schoolCode: null });
    render(<TeacherJoin />);

    type("MAP4KZ");
    fireEvent.click(screen.getByRole("button", { name: /join my class/i }));

    await waitFor(() => expect(getOnboardingDraft().classCode).toBe("MAP4KZ"));
    expect(getOnboardingDraft().schoolCode).toBeUndefined();
  });

  it("does not keep the onboarding token, which would be stale by the time it is spent", async () => {
    // It lives 20 minutes, and the profiling probes and consent gate sit
    // between here and account creation. The sequence mints a fresh one.
    connectClassCode.mockResolvedValue(connection);
    render(<TeacherJoin />);

    type("MAP4KZ");
    fireEvent.click(screen.getByRole("button", { name: /join my class/i }));

    await waitFor(() => expect(getOnboardingDraft().classId).toBeTruthy());
    expect(JSON.stringify(getOnboardingDraft())).not.toContain("tok-onboard");
  });

  it("tells a child their code was refused, and blames us when it was us", async () => {
    connectClassCode.mockRejectedValue(new ApiError(404, "no such class"));
    render(<TeacherJoin />);

    type("WRONG1");
    fireEvent.click(screen.getByRole("button", { name: /join my class/i }));

    await waitFor(() =>
      expect(screen.getByText(/doesn.t match a class/i)).toBeTruthy(),
    );
    expect(getOnboardingDraft().classId).toBeUndefined();
  });

  it("does not blame a child for a check we could not run", async () => {
    connectClassCode.mockRejectedValue(new ApiError(500, "boom"));
    render(<TeacherJoin />);

    type("MAP4KZ");
    fireEvent.click(screen.getByRole("button", { name: /join my class/i }));

    await waitFor(() =>
      expect(screen.getByText(/couldn.t check that just now/i)).toBeTruthy(),
    );
    expect(screen.queryByText(/doesn.t match a class/i)).toBeNull();
  });

  it("checks a scanned code without making the child retype it", async () => {
    connectClassCode.mockResolvedValue(connection);
    params.set("code", "MAP4KZ");

    render(<TeacherJoin />);

    await waitFor(() => expect(connectClassCode).toHaveBeenCalledTimes(1));
    expect(connectClassCode).toHaveBeenCalledWith({ classCode: "MAP4KZ" });
  });
});

describe("a class QR scanned on a tablet someone is signed into", () => {
  /*
   * The scanned code posted itself with the signed-in child's token - joining
   * the WRONG child to the class - and onboarding then ran under their
   * session. Nothing may be sent until the tablet has been handed over.
   */
  const signedInAs = (userId: string) =>
    setSession({
      token: `tok-${userId}`,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      userId,
      role: "student",
    });

  afterEach(() => clearSession());

  it("asks to hand the tablet over, and sends nothing first", async () => {
    signedInAs("ada");
    connectClassCode.mockResolvedValue(connection);
    params.set("code", "MAP4KZ");

    render(<TeacherJoin />);

    expect(await screen.findByText("Someone new is joining")).toBeVisible();
    expect(connectClassCode).not.toHaveBeenCalled();
  });

  it("signs the other child out before the code is checked", async () => {
    signedInAs("ada");
    connectClassCode.mockImplementation(async () => {
      // The request must not carry Ada's session.
      expect(getToken()).toBeUndefined();
      return connection;
    });
    params.set("code", "MAP4KZ");

    render(<TeacherJoin />);
    fireEvent.click(await screen.findByRole("button", { name: "Carry on" }));

    await waitFor(() => expect(connectClassCode).toHaveBeenCalledTimes(1));
    expect(signOut).toHaveBeenCalled();
  });
});

describe("a scanned code is a new child at the door", () => {
  it("starts from an empty draft, not the last child's", async () => {
    // A child who walked away mid-onboarding left all of this behind.
    mergeOnboardingDraft({
      name: "Ada Obi",
      age: 9,
      joinToken: "someone-elses-invite",
    });
    connectClassCode.mockResolvedValue(connection);
    params.set("code", "MAP4KZ");

    render(<TeacherJoin />);

    await waitFor(() => expect(getOnboardingDraft().classId).toBe("class-uuid-1"));
    const draft = getOnboardingDraft();
    expect(draft.name).toBeUndefined();
    expect(draft.joinToken).toBeUndefined();
  });

  it("keeps a draft this child has already started, reached from the class step", async () => {
    // Name first, then no class found, then the code: that draft is theirs.
    mergeOnboardingDraft({ name: "Bayo Kalu", age: 10 });
    connectClassCode.mockResolvedValue(connection);

    render(<TeacherJoin />);
    type("MAP4KZ");
    fireEvent.click(screen.getByRole("button", { name: /join/i }));

    await waitFor(() => expect(getOnboardingDraft().classId).toBe("class-uuid-1"));
    expect(getOnboardingDraft().name).toBe("Bayo Kalu");
  });
});

describe("TeacherJoin - the QR half", () => {
  it("never claims a join it has not made", async () => {
    // It used to walk three timers to "You're in - opening your class…" and
    // then call onJoined() at 5.3s having contacted nothing and written
    // nothing. No camera was ever opened - there is no getUserMedia,
    // BarcodeDetector or <video> anywhere in this app.
    params.set("mode", "scan");
    vi.useFakeTimers();
    try {
      render(<TeacherJoin />);
      await vi.advanceTimersByTimeAsync(10_000);

      expect(screen.queryByText(/you.re in/i)).toBeNull();
      expect(screen.queryByText(/connecting you/i)).toBeNull();
      expect(push).not.toHaveBeenCalled();
      expect(getOnboardingDraft().classId).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("points the child at the scanner they already have", () => {
    // The teacher's QR encodes a whole URL, so the device's own camera app
    // lands them back here with ?code= filled in.
    params.set("mode", "scan");
    render(<TeacherJoin />);

    expect(screen.getByText(/open the camera on your device/i)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /enter a code instead/i }),
    ).toBeTruthy();
  });
});

describe("nextStepAfterName", () => {
  it("sends a class-code child straight past school and class", () => {
    expect(nextStepAfterName({ classCode: "MAP4KZ", classId: "c1" })).toBe(
      "/student/onboarding/sequence",
    );
  });

  it("sends an invite-link child straight past them too", () => {
    // `WelcomeScreen` stored the token and the sequence redeems it; there is
    // nothing left for the school step to ask.
    expect(nextStepAfterName({ joinToken: "tok" })).toBe(
      "/student/onboarding/sequence",
    );
  });

  it("still sends an ordinary child to the school step", () => {
    expect(nextStepAfterName({ name: "Amara", age: 9 })).toBe(
      "/student/onboarding/school",
    );
  });

  it("does not skip on a half-resolved class", () => {
    // A classId with no code and no school code cannot be connected at PIN
    // time, so the school route is still the honest one.
    expect(nextStepAfterName({ classId: "c1" })).toBe(
      "/student/onboarding/school",
    );
  });
});
