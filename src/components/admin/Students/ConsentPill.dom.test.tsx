import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import {
  ConsentPill,
  consentDetailLine,
  mayRequestConsent,
  withdrawnCount,
  withoutRecordedConsent,
} from "./ConsentPill";
import type { StudentConsent } from "@/lib/api/students";

/**
 * Two rules are pinned here because breaking either misinforms a school about a
 * legal position, and both are easy to break by accident:
 *
 * 1. An ABSENT consent object is not "not sent". A read that did not carry
 *    consent must not render as a school having asked nobody.
 * 2. Consent is never derived from account status. An active account is not a
 *    granted consent - conflating them was the obvious shortcut when the field
 *    did not exist, and it stays wrong now that it does.
 */

const at = (status: StudentConsent["status"], over: Partial<StudentConsent> = {}) =>
  ({ status, actorId: null, actorName: null, timestamp: null, channel: null, ...over });

const text = (el: HTMLElement) => (el.textContent ?? "").replace(/\u2019/g, "'");

describe("ConsentPill", () => {
  it("renders each of the four states with its own label", () => {
    const seen = (["confirmed", "pending", "not_sent", "withdrawn"] as const).map(
      (s) => text(render(<ConsentPill consent={at(s)} />).container),
    );
    expect(seen).toEqual(["Confirmed", "Pending", "Not sent", "Withdrawn"]);
  });

  it("says Unknown when the read carried no consent - never 'Not sent'", () => {
    for (const missing of [null, undefined]) {
      const { container } = render(<ConsentPill consent={missing} />);
      expect(text(container)).toBe("Unknown");
      expect(text(container)).not.toMatch(/Not sent/);
    }
  });

  it("uses no red for withdrawn - the palette has no alarm colours", () => {
    const { container } = render(<ConsentPill consent={at("withdrawn")} />);
    const cls = container.firstElementChild?.className ?? "";
    expect(cls).toMatch(/violet/);
    expect(cls).not.toMatch(/red|rose|danger|destructive/);
  });
});

/**
 * These two count different things and the difference is the whole ruling.
 *
 * One counts the records a school still has to complete; the other counts a
 * parent's explicit refusal, which only the parent can lift. (SCRUM-80's "the
 * child proceeds" is overtaken - the consent gate is the product, Hub 2 Nov -
 * but the two numbers still answer different questions.)
 */
const ROWS = [
  { consent: at("confirmed") },
  { consent: at("pending") },
  { consent: at("withdrawn") },
  { consent: at("not_sent") },
  // No consent on the read is not a fact about the student either way.
  { consent: null },
  {},
];

describe("withoutRecordedConsent", () => {
  it("counts everyone not confirmed, and ignores unknowns", () => {
    expect(withoutRecordedConsent(ROWS)).toBe(3);
  });
});

describe("withdrawnCount", () => {
  it("counts only an actual withdrawal", () => {
    expect(withdrawnCount(ROWS)).toBe(1);
  });

  it("never treats an absent record as a withdrawal", () => {
    expect(withdrawnCount([{ consent: null }, {}])).toBe(0);
  });

  it("is not the same number as the paperwork count", () => {
    // If these ever agree on this fixture, one of them has been rewritten
    // into the other and the distinction is gone.
    expect(withdrawnCount(ROWS)).not.toBe(withoutRecordedConsent(ROWS));
  });
});

describe("consentDetailLine", () => {
  it("names the actor and the date on a withdrawal, per SCRUM-40", () => {
    expect(
      consentDetailLine(
        at("withdrawn", { actorName: "Mrs. Eze", timestamp: "2026-07-14T09:00:00Z" }),
      ),
    ).toBe("Mrs. Eze withdrew consent on 14 July 2026.");
  });

  it("still says a withdrawal happened when the actor is unknown", () => {
    expect(consentDetailLine(at("withdrawn"))).toMatch(/withdrawn/i);
  });
});

/**
 * A parent who has withdrawn must never be asked again.
 *
 * Both student screens gated the action on "anything but confirmed", which
 * includes WITHDRAWN — so an admin could send a fresh consent request to a
 * family who had explicitly refused, by pressing a button beside their child's
 * name. SCRUM-40 forbids it outright.
 *
 * It matters more since backend began enforcing withdrawal on 15 Sep: the child
 * is genuinely stopped now, so asking the parent who stopped them is both
 * futile and pointed.
 */
describe("mayRequestConsent", () => {
  it("offers a request only where one can honestly be made", () => {
    expect(mayRequestConsent(at("not_sent"))).toBe(true);
    expect(mayRequestConsent(at("pending"))).toBe(true);
  });

  it("NEVER offers one after a withdrawal", () => {
    expect(mayRequestConsent(at("withdrawn"))).toBe(false);
  });

  it("does not offer one that is already confirmed", () => {
    expect(mayRequestConsent(at("confirmed"))).toBe(false);
  });

  it("offers nothing when the read carried no consent at all", () => {
    expect(mayRequestConsent(null)).toBe(false);
    expect(mayRequestConsent(undefined)).toBe(false);
  });
});

