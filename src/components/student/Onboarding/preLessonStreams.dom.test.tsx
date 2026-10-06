import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { StudentEntryStep } from "./StudentEntryStep";
import { SsoCallback } from "../Auth/SsoCallback";

/**
 * The two signal streams that open before any lesson.
 *
 * Both built their own session id - `auth-<id>` on the SSO callback,
 * `onboarding-school-<id>` on the school-code step - and neither said what it
 * was, so each defaulted to a LESSON stream. The ingest contract declares the
 * id `format: uuid` and a lesson stream needs a lesson id, so `useSignals`
 * held both, correctly, until the screen unmounted and took them with it.
 * They could never have been addressed, whatever they carried.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const { useSignals } = vi.hoisted(() => ({
  useSignals: vi.fn(() => ({ trackEvent: vi.fn(), flush: vi.fn() })),
}));

vi.mock("@/hooks", () => ({
  useSignals,
  useAuth: () => ({ signIn: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/api/auth", () => ({ authApi: { ssoCallback: vi.fn() } }));
vi.mock("@/lib/api/studentEntry", () => ({
  studentEntryApi: { lookup: vi.fn() },
}));

afterEach(() => {
  cleanup();
  useSignals.mockClear();
});

describe("signal streams before the first lesson", () => {
  it("names the SSO handshake as an sso stream, under a UUID", () => {
    render(<SsoCallback />);

    const [id, lessonId, type] = useSignals.mock.calls[0] as unknown[];
    expect(id).toMatch(UUID);
    expect(lessonId).toBeUndefined();
    expect(type).toBe("sso");
  });

  it("names the entry step as onboarding, under a UUID", () => {
    render(<StudentEntryStep framing="school" />);

    const [id, lessonId, type] = useSignals.mock.calls[0] as unknown[];
    expect(id).toMatch(UUID);
    expect(lessonId).toBeUndefined();
    expect(type).toBe("onboarding");
  });
});
