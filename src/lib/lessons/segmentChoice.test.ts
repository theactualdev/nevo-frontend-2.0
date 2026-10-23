import { describe, expect, it } from "vitest";
import {
  chosenFrom,
  lessonPace,
  paceOf,
  paceWrite,
  withSessionChoices,
} from "./segmentChoice";
import type { ChosenVersion } from "@/lib/types";

/**
 * K4 (Lydia, 21 Oct): the child's chosen version - format, depth and Slower -
 * held on the server: the format per section, depth and Slower for the
 * sitting (Lydia, 22 Oct; 741685e). The wire keeps depth and Slower apart;
 * the player's chips are one pace. These are the two directions between them.
 */

describe("a stored choice, as the player reads it", () => {
  it("reads the format and the depth", () => {
    expect(chosenFrom({ modality: "audio", depth: "simplified" })).toEqual({
      modality: "audio",
      density: "simplify",
    });
    expect(chosenFrom({ depth: "expanded" })).toEqual({ density: "expand" });
  });

  it("reads Slower", () => {
    expect(chosenFrom({ slower: true })).toEqual({ density: "slower" });
  });

  it("reads the standard text chosen as a choice, and silence as none", () => {
    expect(chosenFrom({ depth: "original" })).toEqual({ density: null });
    expect(chosenFrom({ slower: false })).toEqual({ density: null });
    expect(chosenFrom({ depth: null, slower: null })).toBeUndefined();
    expect(chosenFrom({ modality: "visual" })).toEqual({ modality: "visual" });
  });

  it("is nothing for no choice, or a format it does not know", () => {
    expect(chosenFrom(null)).toBeUndefined();
    expect(chosenFrom(undefined)).toBeUndefined();
    expect(
      chosenFrom({ modality: "hologram" as never, updatedAt: "2026-10-21" }),
    ).toBeUndefined();
  });
});

describe("the write a pick makes", () => {
  it("sends only what changed", () => {
    expect(paceWrite(undefined, "simplify")).toEqual({ depth: "simplified" });
    expect(paceWrite(undefined, "slower")).toEqual({ slower: true });
  });

  it("clears with null going back to the standard text", () => {
    expect(paceWrite("simplify", null)).toEqual({ depth: null });
    expect(paceWrite("slower", null)).toEqual({ slower: null });
  });

  it("moves between a depth and Slower in one write", () => {
    expect(paceWrite("expand", "slower")).toEqual({ depth: null, slower: true });
    expect(paceWrite("slower", "simplify")).toEqual({
      depth: "simplified",
      slower: null,
    });
  });

  it("is nothing where nothing changes", () => {
    expect(paceWrite(undefined, null)).toBeNull();
    expect(paceWrite(null, null)).toBeNull();
    expect(paceWrite("expand", "expand")).toBeNull();
  });
});

describe("the sitting's own word on each format, over the lesson read's", () => {
  const read = new Map<string, ChosenVersion>([
    ["a", { modality: "audio" }],
    ["b", { modality: "audio", density: "simplify" }],
    ["c", { modality: "visual" }],
  ]);

  it("wins for each section's format, and a section it names none for has none", () => {
    const merged = withSessionChoices(
      read,
      { a: { modality: "visual" }, d: { modality: "audio" } },
      ["a", "b", "c", "d"],
      () => false,
    );

    expect(Object.fromEntries(merged)).toEqual({
      a: { modality: "visual" },
      b: { density: "simplify" },
      d: { modality: "audio" },
    });
  });

  it("never wipes a pace for carrying none: its entries are the format alone (741685e)", () => {
    const merged = withSessionChoices(
      read,
      { b: { modality: "text", updatedAt: "2026-10-22T14:00:00Z" } },
      ["b"],
      () => false,
    );

    expect(merged.get("b")).toEqual({ modality: "text", density: "simplify" });
  });

  it("reads no pace from an entry, even one from an older sitting that still has it", () => {
    const merged = withSessionChoices(
      new Map(),
      { d: { slower: true, depth: "expanded" } as never },
      ["d"],
      () => false,
    );

    expect(merged.has("d")).toBe(false);
  });

  it("leaves alone the sections it is told to keep", () => {
    const merged = withSessionChoices(
      read,
      {},
      ["a", "b", "c"],
      (id) => id === "b",
    );

    expect(Object.fromEntries(merged)).toEqual({
      b: { modality: "audio", density: "simplify" },
    });
  });
});

describe("the sitting's pace (741685e: depth and Slower hold for the sitting)", () => {
  it("is what POST /session's lessonPreferences names, or none", () => {
    expect(paceOf({ depth: "simplified", slower: null })).toBe("simplify");
    expect(paceOf({ depth: "expanded" })).toBe("expand");
    expect(paceOf({ slower: true, depth: null })).toBe("slower");
    expect(paceOf({ depth: "original", slower: false })).toBeNull();
    // A new sitting inherits nothing.
    expect(paceOf({})).toBeNull();
    expect(paceOf({ depth: null, slower: null, updatedAt: null })).toBeNull();
    expect(paceOf(undefined)).toBeNull();
  });

  it("is the one the lesson read's sections show", () => {
    expect(
      lessonPace([{ density: "simplify" }, { density: "simplify" }, undefined]),
    ).toBe("simplify");
    expect(lessonPace([{ modality: "audio" }, { density: "slower" }])).toBe(
      "slower",
    );
    expect(lessonPace([undefined, { modality: "visual" }])).toBeNull();
    expect(lessonPace([])).toBeNull();
  });

  it("is not cleared by a section showing the standard text for want of an approved rewrite", () => {
    // The server reads `depth: "original"` there while the sitting keeps
    // Simplify - first, last or in between.
    expect(
      lessonPace([{ density: null }, { density: "simplify" }, { density: null }]),
    ).toBe("simplify");
    expect(lessonPace([{ density: "expand" }, { density: null }])).toBe("expand");
    expect(lessonPace([{ density: null }, { density: null }])).toBeNull();
  });
});
