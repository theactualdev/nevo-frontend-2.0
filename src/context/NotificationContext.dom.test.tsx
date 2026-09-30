import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useContext } from "react";
import { NotificationContext, NotificationProvider } from "./NotificationContext";

/**
 * THE BELL INVENTED A MESSAGE FROM A NAMED TEACHER.
 *
 * The signed-out branch returned two authored rows, and the second was "Ms
 * Okafor sent you a message - Lovely work on your fractions today": a
 * fabricated message attributed to a real teacher, praising work the child may
 * never have done. A child could have thanked her for it.
 *
 * Rule 5 rather than Zero-Tag, and the distinction matters because it was
 * nearly triaged against the wrong checklist. Zero-Tag is diagnostic labels,
 * learner types and modality categories; praise is none of those. Rule 5 is
 * "absence is an instruction - render the nothing-state, do not fill the gap".
 *
 * IT REACHED GENUINELY SIGNED-IN CHILDREN, which is the half that made it
 * urgent rather than cosmetic. `useHasSession` reads localStorage and its
 * server snapshot is hardcoded false, and this provider is mounted in the root
 * layout - so every student page's server markup and first client frame ran the
 * signed-out branch for a child who was signed in.
 *
 * Emptying the array alone would have closed the symptom and left the
 * mechanism, so these cover both: that nothing is invented, AND that the branch
 * cannot run before the client can see the token. The second is the one that
 * still holds if somebody puts content back.
 */

const hasSession = vi.hoisted(() => ({ value: false }));
vi.mock("@/hooks/useHasSession", () => ({
  useHasSession: () => hasSession.value,
}));

const hydrated = vi.hoisted(() => ({ value: true }));
vi.mock("@/hooks/useHydrated", () => ({
  useHydrated: () => hydrated.value,
}));

const listResult = vi.hoisted(() => ({
  value: new Promise<unknown>(() => {}) as Promise<unknown>,
}));
const markRead = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/notifications", () => ({
  notificationsApi: {
    list: () => listResult.value,
    markRead: (id: string) => markRead(id),
  },
}));

const token = vi.hoisted(() => ({
  value: undefined as string | undefined,
  /** Whose token it is - a different child on the same tablet has another. */
  userId: "student-1",
  listeners: new Set<() => void>(),
}));
vi.mock("@/lib/auth/session", () => ({
  getToken: () => token.value,
  getSession: () => (token.value ? { userId: token.userId } : null),
  onSessionChange: (listener: () => void) => {
    token.listeners.add(listener);
    return () => token.listeners.delete(listener);
  },
}));

/** What `setSession` / `clearSession` announce. */
const sessionChanged = () => {
  for (const l of token.listeners) l();
};

/** One unread row, as the feed returns them. */
const feedOf = (read: boolean) => ({
  notifications: [
    {
      notificationId: "n-1",
      title: "A new lesson is ready",
      description: null,
      createdAt: new Date().toISOString(),
      read,
      navigatesTo: null,
    },
  ],
  unreadCount: read ? 0 : 1,
});

/*
 * THE SAMPLES ARE MOCKED WITH A FABRICATION ON PURPOSE.
 *
 * With the real array empty, the signed-out branch and the nothing-state return
 * identical values, so a test that only counted rows would pass whether or not
 * the hydration guard existed - it would close the symptom and prove nothing
 * about the mechanism. Standing a row back up here is what makes the guard
 * observable, and it is the same row that shipped.
 */
vi.mock("@/lib/mocks/sampleNotifications", () => ({
  SAMPLE_NOTIFICATIONS: [
    {
      id: "n2",
      title: "Ms Okafor sent you a message",
      text: "Lovely work on your fractions today",
      ago: "1d",
    },
  ],
}));

/** Everything a bell could render, flattened so a fabrication cannot hide. */
function Probe() {
  const ctx = useContext(NotificationContext)!;
  return (
    <div>
      <span data-testid="unread">{ctx.unreadCount}</span>
      <span data-testid="count">{ctx.notifications.length}</span>
      <span data-testid="failed">{String(ctx.failed)}</span>
      <span data-testid="text">
        {ctx.notifications.map((n) => `${n.title} ${n.text ?? ""}`).join(" | ")}
      </span>
    </div>
  );
}

const shown = () => ({
  unread: screen.getByTestId("unread").textContent,
  count: screen.getByTestId("count").textContent,
  failed: screen.getByTestId("failed").textContent,
  text: screen.getByTestId("text").textContent ?? "",
});

const mount = () =>
  render(
    <NotificationProvider>
      <Probe />
    </NotificationProvider>,
  );

beforeEach(() => {
  hasSession.value = false;
  hydrated.value = true;
  token.value = undefined;
  token.userId = "student-1";
  token.listeners.clear();
});

afterEach(() => {
  cleanup();
});

describe("what the bell says when nobody has told it anything", () => {
  it("invents no notification for a signed-out visitor", async () => {
    // The real module, not the fabrication the rest of this file stands up.
    const actual = await vi.importActual<
      typeof import("@/lib/mocks/sampleNotifications")
    >("@/lib/mocks/sampleNotifications");

    expect(actual.SAMPLE_NOTIFICATIONS).toEqual([]);
  });

  it("names no teacher and reports no praise", async () => {
    // The specific failure: a message attributed to a real person, about work
    // that may never have happened. Asserted against the REAL module, because
    // the rest of this file deliberately stands a fabrication back up.
    const actual = await vi.importActual<
      typeof import("@/lib/mocks/sampleNotifications")
    >("@/lib/mocks/sampleNotifications");
    const text = actual.SAMPLE_NOTIFICATIONS.map(
      (n) => `${n.title} ${n.text ?? ""}`,
    ).join(" | ");

    expect(text).not.toMatch(/okafor|lovely work|waiting for you/i);
  });
});

describe("the branch cannot run before the client can see the token", () => {
  it("shows nothing at all while unhydrated, signed in or not", () => {
    /*
     * The mechanism, not the symptom. `useHasSession` cannot tell a signed-in
     * child from a visitor until the client is running, so the signed-out
     * branch is not safe to take until then - whatever it happens to contain
     * today. This is the assertion that still fails if someone puts an array
     * back.
     */
    hydrated.value = false;
    token.value = "a-real-token";
    hasSession.value = false; // what the server snapshot always reports

    mount();

    expect(shown().count).toBe("0");
    expect(shown().unread).toBe("0");
    expect(shown().text).not.toMatch(/okafor/i);
  });

  it("DOES take the sample branch once hydrated and signed out", () => {
    // The other side of the guard. If this passed while the one above failed,
    // the guard would be doing nothing and the branch would simply be dead -
    // which is not what was asked for and would rot differently.
    hydrated.value = true;
    hasSession.value = false;

    mount();

    expect(shown().count).toBe("1");
    expect(shown().unread).toBe("1");
  });

  it("raises no unread dot on the first frame of a signed-in child", () => {
    // The visible symptom: a violet dot with nothing behind it, on every
    // student page, because the provider is mounted in the root layout.
    hydrated.value = false;
    hasSession.value = false;
    mount();

    expect(shown().unread).toBe("0");
  });

  it("does not claim the feed failed while it is simply not known yet", () => {
    // "We could not load this" is as much a claim as "nothing new". Neither is
    // true before the client has had a chance to ask.
    hydrated.value = false;
    mount();

    expect(shown().failed).toBe("false");
  });
});

describe("the live path, which was already right", () => {
  it("shows nothing rather than samples while a real feed is in flight", () => {
    hydrated.value = true;
    hasSession.value = true;
    token.value = "a-real-token";

    mount();

    expect(shown().count).toBe("0");
    expect(shown().failed).toBe("false");
  });
});

describe("a tablet that more than one child signs into", () => {
  /*
   * THE PROVIDER IS MOUNTED ONCE, AT THE ROOT. It read the feed when the app
   * loaded and never again - so a child who signed in afterwards had no bell,
   * and the next child on the tablet could open the one before them's.
   */
  it("loads the feed when a child signs in after the app opened", async () => {
    hasSession.value = true;
    listResult.value = Promise.resolve(feedOf(false));
    mount();
    expect(shown().count).toBe("0");

    // Signed in with the app already open, as the PIN screen does.
    token.value = "tok-1";
    await act(async () => sessionChanged());

    await waitFor(() => expect(shown().count).toBe("1"));
    expect(shown().unread).toBe("1");
  });

  it("drops the last child's feed the moment another child signs in", async () => {
    hasSession.value = true;
    token.value = "tok-1";
    listResult.value = Promise.resolve(feedOf(false));
    mount();
    await waitFor(() => expect(shown().count).toBe("1"));

    // The next child's feed has not answered yet - and the last child's must
    // not be what they see while it is on its way.
    listResult.value = new Promise(() => {});
    token.value = "tok-2";
    token.userId = "student-2";
    await act(async () => sessionChanged());

    expect(shown().count).toBe("0");
    expect(shown().unread).toBe("0");
  });

  it("does not reload for a token refresh, which is the same child", async () => {
    hasSession.value = true;
    token.value = "tok-1";
    let calls = 0;
    const feed = feedOf(false);
    listResult.value = {
      then: (ok: (v: unknown) => unknown) => {
        calls += 1;
        return Promise.resolve(feed).then(ok);
      },
    } as unknown as Promise<unknown>;
    mount();
    await waitFor(() => expect(shown().count).toBe("1"));
    const before = calls;

    token.value = "tok-1-refreshed";
    await act(async () => sessionChanged());

    expect(calls).toBe(before);
    expect(shown().count).toBe("1");
  });
});

describe("marking a notification read", () => {
  /**
   * THE CHILD'S BELL COULD NOT CLEAR ITS OWN DOT.
   *
   * `notificationsApi.markRead` has existed since the endpoint shipped and the
   * admin panel has called it all along. The student bell called neither it nor
   * `markAllRead`, so a notification stayed unread for a child who had read it,
   * and the only thing that ever changed the state was a teacher or an admin
   * opening the same row on their own screen.
   *
   * A port, not a build - which is why the interesting assertions here are the
   * failure behaviour rather than the happy path.
   */
  const Probe2 = () => {
    const ctx = useContext(NotificationContext)!;
    return (
      <div>
        <span data-testid="unread">{ctx.unreadCount}</span>
        <span data-testid="read">
          {String(ctx.notifications[0]?.read ?? "none")}
        </span>
        <button type="button" onClick={() => ctx.markRead("n-1")}>
          mark
        </button>
      </div>
    );
  };

  const mount2 = () =>
    render(
      <NotificationProvider>
        <Probe2 />
      </NotificationProvider>,
    );

  beforeEach(() => {
    hydrated.value = true;
    hasSession.value = true;
    token.value = "a-real-token";
    markRead.mockReset().mockResolvedValue(undefined);
    listResult.value = Promise.resolve(feedOf(false));
  });

  it("tells the server, and clears the dot straight away", async () => {
    mount2();
    await waitFor(() =>
      expect(screen.getByTestId("unread").textContent).toBe("1"),
    );

    fireEvent.click(screen.getByRole("button", { name: "mark" }));

    expect(screen.getByTestId("read").textContent).toBe("true");
    expect(screen.getByTestId("unread").textContent).toBe("0");
    await waitFor(() => expect(markRead).toHaveBeenCalledWith("n-1"));
  });

  it("puts the dot back when the write does not land", async () => {
    /*
     * The half that matters. A notification shown as read but never marked is
     * a message the child never sees again; a dot that returns is only the
     * truthful state of a write that failed.
     */
    markRead.mockRejectedValue(new Error("offline"));
    mount2();
    await waitFor(() =>
      expect(screen.getByTestId("unread").textContent).toBe("1"),
    );

    fireEvent.click(screen.getByRole("button", { name: "mark" }));

    await waitFor(() =>
      expect(screen.getByTestId("read").textContent).toBe("false"),
    );
    expect(screen.getByTestId("unread").textContent).toBe("1");
  });

  it("does not write for a signed-out visitor", async () => {
    // The samples are not anybody's notifications, and there is no token to
    // write with.
    token.value = undefined;
    hasSession.value = false;
    mount2();

    fireEvent.click(screen.getByRole("button", { name: "mark" }));

    await waitFor(() => expect(markRead).not.toHaveBeenCalled());
  });
});

describe("which branch the bell is on", () => {
  /**
   * `showingSamples` is what makes the sample sweep able to see this surface
   * at all. It marks the BRANCH: the failure worth catching is a signed-in
   * child falling into the signed-out one and being told "Nothing new right
   * now" - a claim about their feed that nobody checked - and that failure
   * leaves no sample rows behind to notice.
   */
  const Probe3 = () => {
    const ctx = useContext(NotificationContext)!;
    return <span data-testid="samples">{String(ctx.showingSamples)}</span>;
  };

  const showing = () => {
    render(
      <NotificationProvider>
        <Probe3 />
      </NotificationProvider>,
    );
    return screen.getByTestId("samples").textContent;
  };

  it("is true for a visitor seeing the designed demo", () => {
    hydrated.value = true;
    hasSession.value = false;

    expect(showing()).toBe("true");
  });

  it("is false for a child reading their own feed", () => {
    hydrated.value = true;
    hasSession.value = true;
    token.value = "a-real-token";

    expect(showing()).toBe("false");
  });

  it("is false before the client knows who is here", () => {
    // A deliberate blank, not a fixture. Marking it would put the attribute on
    // every page for everyone for a frame.
    hydrated.value = false;

    expect(showing()).toBe("false");
  });
});
