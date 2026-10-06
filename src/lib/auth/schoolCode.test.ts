import { describe, expect, it } from "vitest";
import {
  SCHOOL_CODE_LENGTH,
  placeSchoolCode,
  schoolCodeChars,
} from "./schoolCode";

/**
 * Design's D6 and backend's SCRUM-201: four characters, no prefix, from every
 * letter and digit except 0, O, 1 and I.
 */

const EMPTY = ["", "", "", ""];

describe("schoolCodeChars", () => {
  it("is four cells long", () => {
    expect(SCHOOL_CODE_LENGTH).toBe(4);
  });

  it("keeps every character a school code can contain, capitalised", () => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    expect(schoolCodeChars(alphabet)).toBe(alphabet);
    expect(schoolCodeChars(alphabet.toLowerCase())).toBe(alphabet);
  });

  it("drops 0, O, 1 and I, whatever their case", () => {
    expect(schoolCodeChars("0Oo1Ii")).toBe("");
  });

  it("drops what is not a letter or a digit, including the old prefix's hyphen", () => {
    expect(schoolCodeChars("NEVO-K7DQ")).toBe("NEVK7DQ");
    expect(schoolCodeChars(" k7 dq ")).toBe("K7DQ");
  });
});

describe("placeSchoolCode", () => {
  it("fills one cell with one character", () => {
    expect(placeSchoolCode(EMPTY, 1, "k")).toEqual({
      cells: ["", "K", "", ""],
      last: 1,
    });
  });

  it("runs a paste on into the cells after it, and stops at the last", () => {
    expect(placeSchoolCode(EMPTY, 2, "K7DQ")).toEqual({
      cells: ["", "", "K", "7"],
      last: 3,
    });
  });

  it("writes nothing when nothing typed belongs in a code", () => {
    expect(placeSchoolCode(["K", "", "", ""], 1, "0")).toEqual({
      cells: ["K", "", "", ""],
      last: null,
    });
  });

  it("does not change the cells it was given", () => {
    const cells = ["", "", "", ""];
    placeSchoolCode(cells, 0, "K7DQ");
    expect(cells).toEqual(EMPTY);
  });
});
