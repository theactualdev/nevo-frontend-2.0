import { describe, expect, it } from "vitest";
import { chosenFrom, paceWrite, withSessionChoices } from "./segmentChoice";
import type { ChosenVersion } from "@/lib/types";

/**
 * K4 (Lydia, 21 Oct): the child's chosen version - format, depth and Slower -
 * held on the server per section. The wire keeps depth and Slower apart; the
 * player's chips are one pace. These are the two directions between them.
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

describe("the sitting's own word, over the lesson read's", () => {
  const read = new Map<string, ChosenVersion>([
    ["a", { modality: "audio" }],
    ["b", { density: "simplify" }],
    ["c", { modality: "visual" }],
  ]);

  it("wins for each section, and a section it names nothing for has none", () => {
    const merged = withSessionChoices(
      read,
      { a: { modality: "visual" }, d: { slower: true } },
      ["a", "b", "c", "d"],
      () => false,
    );

    expect(Object.fromEntries(merged)).toEqual({
      a: { modality: "visual" },
      d: { density: "slower" },
    });
  });

  it("leaves alone the sections it is told to keep", () => {
    const merged = withSessionChoices(
      read,
      {},
      ["a", "b", "c"],
      (id) => id === "b",
    );

    expect(Object.fromEntries(merged)).toEqual({ b: { density: "simplify" } });
  });
});
