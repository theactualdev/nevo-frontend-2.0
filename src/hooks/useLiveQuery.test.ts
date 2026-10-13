import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useLiveQuery } from "./useLiveQuery";
import { clearSession, setSession } from "@/lib/auth/session";

/**
 * `useLiveQuery` is the highest-leverage thing in the codebase to test: it
 * exists BECAUSE four hooks each independently grew the same bug - racing a
 * timeout against the request and treating a slow answer as a failed one, so
 * a teacher sat looking at sample data while their real class list had
 * already arrived.
 *
 * The trap this file is written around: the effect begins
 *
 *     if (!getToken()) return;
 *
 * so in jsdom with no session, the hook fetches NOTHING, `data` stays null and
 * `failed` stays false - and a test that forgot to sign in passes while
 * exercising an early return. Every test here establishes a session first,
 * and the last one asserts that behaviour deliberately rather than
 * accidentally relying on it.
 */

const signIn = () =>
  setSession({
    token: "tok-test",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    userId: "user-1",
    role: "teacher",
  });

describe("useLiveQuery", () => {
  it("returns what the request resolved with", async () => {
    signIn();
    const run = vi.fn(async () => ({ classes: ["7A"] }));
    const { result } = renderHook(() => useLiveQuery(run, []));

    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.data).toEqual({ classes: ["7A"] });
    expect(result.current.failed).toBe(false);
  });

  it("reports failure rather than an empty result when the request rejects", async () => {
    signIn();
    // The distinction that matters everywhere downstream: a screen must be
    // able to tell "we could not load this" from "there is nothing here".
    const run = vi.fn(async () => {
      throw new Error("500");
    });
    const { result } = renderHook(() => useLiveQuery(run, []));

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("clears a previous failure when a later attempt succeeds", async () => {
    signIn();
    let attempt = 0;
    const run = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("500");
      return { ok: true };
    });

    const { result, rerender } = renderHook(
      ({ dep }) => useLiveQuery(run, [dep]),
      { initialProps: { dep: 1 } },
    );
    await waitFor(() => expect(result.current.failed).toBe(true));

    rerender({ dep: 2 });
    await waitFor(() => expect(result.current.data).toEqual({ ok: true }));
    // A stale `failed` would leave the screen apologising for an error that
    // has since resolved.
    expect(result.current.failed).toBe(false);
  });

  it("does not apply a late response from a superseded request", async () => {
    signIn();
    // THE ORIGINAL BUG, in miniature. Two requests in flight; the first is
    // slower and answers last. Its answer belongs to a query nobody is
    // watching any more, and applying it would show a teacher the previous
    // class's data.
    const resolvers: Array<(v: unknown) => void> = [];
    const run = vi.fn(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );

    const { result, rerender } = renderHook(
      ({ dep }) => useLiveQuery(run, [dep]),
      { initialProps: { dep: 1 } },
    );
    rerender({ dep: 2 });

    await act(async () => {
      resolvers[1]?.({ which: "second" });
      resolvers[0]?.({ which: "first" });
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.data).toEqual({ which: "second" });
  });

  it("does not fetch at all without a session", async () => {
    clearSession();
    const run = vi.fn(async () => ({ classes: [] }));
    renderHook(() => useLiveQuery(run, []));

    // Asserted on purpose: this early return is why a hook test written
    // without a session passes having tested nothing.
    await new Promise((r) => setTimeout(r, 50));
    expect(run).not.toHaveBeenCalled();
  });
});

/**
 * C06. Every read here was once per page load; `refresh` asks again without
 * dropping what is on screen.
 */
describe("useLiveQuery, asked again", () => {
  it("reads again, and shows the new answer", async () => {
    signIn();
    const run = vi.fn().mockResolvedValueOnce("first").mockResolvedValueOnce("second");
    const { result } = renderHook(() => useLiveQuery(run, []));
    await waitFor(() => expect(result.current.data).toBe("first"));

    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.data).toBe("second"));
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("keeps what it had when the re-read fails, and claims no failure", async () => {
    signIn();
    const run = vi.fn().mockResolvedValueOnce("first").mockRejectedValueOnce(new Error("blip"));
    const { result } = renderHook(() => useLiveQuery(run, []));
    await waitFor(() => expect(result.current.data).toBe("first"));

    act(() => result.current.refresh());

    await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(result.current.data).toBe("first");
    expect(result.current.failed).toBe(false);
  });

  it("recovers a failed read when asked again", async () => {
    signIn();
    const run = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce("back");
    const { result } = renderHook(() => useLiveQuery(run, []));
    await waitFor(() => expect(result.current.failed).toBe(true));

    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.data).toBe("back"));
    expect(result.current.failed).toBe(false);
  });

  it("is still failed when asking again fails too", async () => {
    signIn();
    const run = vi.fn().mockRejectedValue(new Error("down"));
    const { result } = renderHook(() => useLiveQuery(run, []));
    await waitFor(() => expect(result.current.failed).toBe(true));

    act(() => result.current.refresh());

    await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    await act(async () => {});
    expect(result.current.failed).toBe(true);
  });

  it("still says a first read has failed when its deps change, as before", async () => {
    signIn();
    const run = vi.fn().mockResolvedValueOnce("a").mockRejectedValueOnce(new Error("down"));
    const { result, rerender } = renderHook(({ id }) => useLiveQuery(run, [id]), {
      initialProps: { id: 1 },
    });
    await waitFor(() => expect(result.current.data).toBe("a"));

    rerender({ id: 2 });

    await waitFor(() => expect(result.current.failed).toBe(true));
  });
});
