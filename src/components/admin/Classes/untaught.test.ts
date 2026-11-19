import { describe, expect, it } from "vitest";
import { untaughtSubjects } from "./untaught";

/**
 * D05's "No teacher yet" row (backlog 27): the class's subjects no current
 * assignment teaches - and null, so no row, whenever that can't be known.
 */
describe("untaughtSubjects", () => {
  const nine = ["Mathematics", "English Language", "Basic Science"];

  it("names the class's subjects nobody teaches, in the class's order and spelling", () => {
    expect(untaughtSubjects(nine, [{ subject: "english language" }])).toEqual([
      "Mathematics",
      "Basic Science",
    ]);
  });

  it("is empty when every subject is taught", () => {
    expect(
      untaughtSubjects(nine, nine.map((subject) => ({ subject }))),
    ).toEqual([]);
  });

  it("can't be known when an assignment carries no subject (older ones)", () => {
    expect(untaughtSubjects(nine, [{ subject: "Mathematics" }, { subject: null }])).toBeNull();
    expect(untaughtSubjects(nine, [{}])).toBeNull();
  });

  it("can't be known when an assignment's subject is a spelling the class doesn't hold", () => {
    expect(untaughtSubjects(nine, [{ subject: "Maths" }])).toBeNull();
  });
});
