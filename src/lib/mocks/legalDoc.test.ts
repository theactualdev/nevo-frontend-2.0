import { describe, expect, it } from "vitest";
import { LEGAL_DOCS } from "./legalDoc";
import { ERASURE_LINE } from "@/components/admin/Students/EraseRecordModal";

/**
 * Lydia, 4 Nov. The privacy notice's "Your rights" said a student's access to
 * their learning "is never affected" by withdrawing consent - untrue, because
 * withdrawal suspends the child's account. And her erasure wording applies
 * wherever the product states the right, this notice by name.
 */
const rights = () => {
  const section = LEGAL_DOCS.privacy.sections.find((s) => s.title === "Your rights");
  if (!section) throw new Error("no Your rights section");
  return section.body;
};

describe("the privacy notice's rights section", () => {
  it("no longer says withdrawing consent leaves a child's access untouched", () => {
    expect(rights()).not.toMatch(/never affected/i);
    expect(rights()).toMatch(/Withdrawing consent suspends your child's account straight away\./);
  });

  it("states deletion in Lydia's words, verbatim", () => {
    expect(rights()).toContain(ERASURE_LINE);
  });
});

describe("the erasure wording", () => {
  it("is Lydia's, word for word (4 Nov, answer 27)", () => {
    expect(ERASURE_LINE).toBe(
      "When you ask us to delete a record it is removed from the live system straight away. A copy can remain in our recovery backups for up to seven more days, and if we ever restore from one we reapply your deletion before anyone can see the data again. Files are not held in those backups at all, so a deleted file is gone immediately.",
    );
  });
});
