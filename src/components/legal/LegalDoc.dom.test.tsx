import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const { back } = vi.hoisted(() => ({ back: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { LegalDoc } from "./LegalDoc";
import { legalHref, legalReturnOf, markLegalOpenedFrom } from "@/lib/legal/returns";

/**
 * PRIVACY & TERMS: "one screen, four entry points, back-action set by where
 * you came from" (the frame). It was "Back" to "/" from everywhere, so a
 * parent who opened it mid-consent was sent to the landing page.
 */

const historyOf = (length: number) =>
  vi.spyOn(window.history, "length", "get").mockReturnValue(length);

beforeEach(() => {
  back.mockReset();
  window.sessionStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("the way back", () => {
  it("goes back to the consent the parent came from (Entry 2)", () => {
    historyOf(3);
    markLegalOpenedFrom("consent");
    render(<LegalDoc doc="privacy" from="consent" />);

    fireEvent.click(screen.getByRole("button", { name: "Back to consent" }));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("goes back to the teacher's activation (Entry 1)", () => {
    historyOf(2);
    markLegalOpenedFrom("activation");
    render(<LegalDoc doc="terms" from="activation" />);

    expect(screen.getByRole("button", { name: "Back to activation" })).toBeInTheDocument();
  });

  it("never says 'Back to consent' in a tab with nowhere to go back to", () => {
    historyOf(1);
    markLegalOpenedFrom("consent");
    render(<LegalDoc doc="privacy" from="consent" />);

    expect(screen.queryByText("Back to consent")).toBeNull();
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/");
  });

  // A new tab can hold history (the blank page it opened on) without having
  // come from the consent: back from there is not the consent either.
  it("never says it in a tab that did not follow the consent's link", () => {
    historyOf(2);
    render(<LegalDoc doc="privacy" from="consent" />);

    expect(screen.queryByText("Back to consent")).toBeNull();
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/");
  });

  it("never takes another entry's mark for its own", () => {
    historyOf(3);
    markLegalOpenedFrom("parent-data");
    render(<LegalDoc doc="privacy" from="consent" />);

    expect(screen.queryByText("Back to consent")).toBeNull();
  });

  it("names the portal's own pages, at their own addresses", () => {
    render(<LegalDoc doc="privacy" from="parent-settings" />);
    expect(screen.getByRole("link", { name: "Back to settings" })).toHaveAttribute(
      "href",
      "/parent-portal/settings",
    );
  });

  it("takes the portal home back home", () => {
    render(<LegalDoc doc="privacy" from="parent-home" />);
    expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute(
      "href",
      "/parent-portal",
    );
  });

  it("keeps the plain way back for an entry it does not know, or none", () => {
    render(<LegalDoc doc="privacy" from="https://elsewhere.example" />);
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/");
  });
});

describe("the links into it", () => {
  it("say where they were opened from, and nothing else", () => {
    expect(legalHref("privacy", "consent")).toBe("/legal/privacy?from=consent");
    expect(legalHref("terms", "activation")).toBe("/legal/terms?from=activation");
  });

  it("read back only the entries it knows", () => {
    expect(legalReturnOf("parent-data")).toBe("parent-data");
    expect(legalReturnOf("toString")).toBeNull();
    expect(legalReturnOf(undefined)).toBeNull();
  });
});
