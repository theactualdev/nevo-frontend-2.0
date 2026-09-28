import { describe, expect, it } from "vitest";
import type { StudentConsent } from "@/lib/api/students";
import { consentCoverage, ndpaClaims } from "./ndpaClaims";

/**
 * The compliance screen is the one place a wrong number is worst, so the rules
 * here are about what it REFUSES to say:
 *
 * 1. Unknown is not zero. A roster that came back without consent records, or
 *    did not come back at all, produces no figure - not a coverage of nought.
 * 2. An outstanding consent is the school's paperwork, not a bar on a child.
 *    SCRUM-80: only a withdrawal stops processing.
 * 3. A row that cannot be measured says why, in its own words.
 */

const at = (status: StudentConsent["status"]): StudentConsent => ({
  status,
  actorId: null,
  actorName: null,
  timestamp: null,
  channel: null,
});

const row = (status: StudentConsent["status"] | null) => ({
  consent: status ? at(status) : null,
});

const claim = (
  consent: Parameters<typeof ndpaClaims>[0]["consent"],
  title: string,
) =>
  ndpaClaims({ labels: 0, consent, retention: "unreadable" }).find(
    (c) => c.title === title,
  )!;

describe("consentCoverage", () => {
  it("keeps confirmed and outstanding apart", () => {
    const c = consentCoverage([
      row("confirmed"),
      row("confirmed"),
      row("pending"),
      row("not_sent"),
      row("withdrawn"),
    ]);
    expect(c).toEqual({ roster: 5, confirmed: 2, outstanding: 3 });
  });

  it("derives confirmed by subtraction so it cannot drift from the roster", () => {
    const rows = [row("confirmed"), row("withdrawn"), row("not_sent")];
    const c = consentCoverage(rows);
    expect(c.confirmed + c.outstanding).toBe(c.roster);
  });

  it("counts a malformed row as outstanding, never as covered", () => {
    /*
     * `consent` is required and non-null on the wire, so this row cannot
     * arrive from a well-formed response - but `api.get<T>` is a cast, not a
     * validation. Overstating what a school still owes is the safe direction
     * to fail on a compliance screen; counting it as covered would not be.
     */
    const c = consentCoverage([row("confirmed"), row(null)]);
    expect(c.confirmed).toBe(1);
    expect(c.roster).toBe(2);
    // In neither bucket: the figure understates rather than claiming a
    // consent we do not hold.
    expect(c.confirmed + c.outstanding).toBeLessThan(c.roster);
  });
});

describe("the parental consent row", () => {
  it("shows a figure when every row carried a record", () => {
    const c = claim(
      consentCoverage([row("confirmed"), row("confirmed"), row("pending")]),
      "Parental consent coverage",
    );
    expect(c.verification).toBe("school");
    expect(c.state).toBe("2 of 3");
  });

  it("does not tell a school a child is blocked", () => {
    const c = claim(
      consentCoverage([row("confirmed"), row("pending")]),
      "Parental consent coverage",
    );
    // SCRUM-80: the school warrants consent; the learner proceeds.
    expect(c.mechanism).not.toMatch(/cannot begin/i);
    expect(c.mechanism).not.toMatch(/can't begin/i);
    expect(c.mechanism).toMatch(/Learning is not held up/);
  });


  it("blames the console, not the school, when the roster would not load", () => {
    const c = claim("unreadable", "Parental consent coverage");
    expect(c.verification).toBe("unverified");
    // Raw string, not rendered - the apostrophe is curly here.
    expect(c.note).toMatch(/nothing about your school[’']s consents has changed/i);
  });

  it("says an empty roster is empty rather than uncovered", () => {
    const c = claim(consentCoverage([]), "Parental consent coverage");
    expect(c.verification).toBe("school");
    expect(c.state).toBe("No learners yet");
  });
});

describe("the retention row", () => {
  const retentionClaimFor = (retention: Parameters<typeof ndpaClaims>[0]["retention"]) =>
    ndpaClaims({ labels: 0, consent: "unreadable", retention }).find(
      (c) => c.title === "Records retention",
    )!;

  it("reports the school's configured position in days and in words", () => {
    const c = retentionClaimFor({ policy: "contract_plus_3_years", days: 1095 });
    expect(c.verification).toBe("school");
    expect(c.state).toBe("1095 days");
    expect(c.mechanism).toMatch(/the contract term plus three years/);
  });

  it("falls back to the raw policy rather than dropping an unknown one", () => {
    const c = retentionClaimFor({ policy: "contract_plus_99_years", days: 40 });
    expect(c.mechanism).toMatch(/contract_plus_99_years/);
  });

  it("shows nothing when the school record would not load", () => {
    const c = retentionClaimFor("unreadable");
    expect(c.verification).toBe("unverified");
    expect(c.state).toBeUndefined();
  });

  it("no longer claims counsel's judgement in its title", () => {
    // Was "Retention within counsel limits" - a verdict this screen cannot
    // reach. It reports the configured period; counsel judges it.
    const titles = ndpaClaims({
      labels: 0,
      consent: "unreadable",
      retention: "unreadable",
    }).map((c) => c.title);
    expect(titles).toContain("Records retention");
    expect(titles).not.toContain("Retention within counsel limits");
  });
});

/**
 * Two rows were PULLED on 14 Sep because they were false, and design and
 * counsel are rewriting both. These fail if either returns without a decision.
 *
 * A compliance screen making a false statement is worse than a missing one —
 * this is the screen a school shows a regulator.
 */
describe("the two claims that were pulled", () => {
  const all = () =>
    ndpaClaims({ labels: 0, consent: "unreadable", retention: "unreadable" });

  it("makes no claim that nothing is written to long-term storage", () => {
    // `GET /api/admin/adaptation-log` returns studentFirstName with trigger
    // and timestamp, filterable by student. The sentence changes, not the log.
    const text = all()
      .map((c) => `${c.title} ${c.mechanism}`)
      .join(" ");
    expect(text).not.toMatch(/nothing about how a learner performed/i);
    expect(text).not.toMatch(/then discarded/i);
    // The retention row's sibling sentence, missed by the 14 Sep pull.
    expect(text).not.toMatch(/ephemeral|no retention period/i);
    expect(all().map((c) => c.title)).not.toContain("Ephemeral processing");
  });

  it("does not offer a parent a right to erasure they cannot exercise", () => {
    // ParentRightType is request_data | object | withdraw_consent. "erasure"
    // appears nowhere in the deployed contract.
    const text = all()
      .map((c) => `${c.title} ${c.mechanism}`)
      .join(" ");
    expect(text).not.toMatch(/request erasure/i);
    expect(all().map((c) => c.title)).not.toContain("Right to erasure");
  });
});

