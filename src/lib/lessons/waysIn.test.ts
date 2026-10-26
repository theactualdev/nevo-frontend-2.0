import { describe, expect, it } from "vitest";
import type { ReteachingResponse, TeachingRoute } from "@/lib/api/lessons";
import { WAY_IN_LABEL, wayOf, waysInFor } from "./waysIn";

/**
 * SCRUM-282: which of the server's routes this screen names, and in whose
 * words. Lydia, 23 Oct: "name only the ways in this screen can actually
 * serve". 17d S3: re-chunking is never named.
 */

const route = (
  action: TeachingRoute["action"],
  format?: TeachingRoute["format"],
): TeachingRoute => ({ action, label: `server words for ${action}`, format });

const reteaching = (
  routes: TeachingRoute[],
  recommended: TeachingRoute = routes[0],
): ReteachingResponse => ({
  questionId: "q-1",
  segmentId: "seg-1",
  availableRoutes: routes,
  recommendedRoute: recommended,
});

const EVERYTHING = {
  formats: ["text", "visual", "audio", "interactive"] as const,
  densities: ["simplify", "expand", "slower"] as const,
};

describe("the ways in a section's re-teaching names", () => {
  it("names each route in the frame's words, never the server's", () => {
    const { ways } = waysInFor(
      reteaching([
        route("format", "visual"),
        route("format", "audio"),
        route("format", "interactive"),
        route("simplify"),
        route("slower"),
      ]),
      EVERYTHING,
    );

    expect(ways.map((w) => WAY_IN_LABEL[w])).toEqual([
      "See it as a picture",
      "Listen to it",
      "Try it yourself",
      "A simpler version",
      "One step at a time",
    ]);
  });

  it("never names re-chunking, the panel or the solver's scaffold", () => {
    const { ways } = waysInFor(
      reteaching([
        route("rechunk"),
        route("simpler_presentation"),
        route("panel"),
        route("calculation_scaffold"),
        route("slower"),
      ]),
      EVERYTHING,
    );

    expect(ways).toEqual(["slower"]);
  });

  it("names the text as the server does, \"Try it as text\" (Lydia, 26 Oct, D2)", () => {
    const { ways } = waysInFor(
      reteaching([route("format", "text"), route("format", "visual")]),
      EVERYTHING,
    );

    expect(ways.map((w) => WAY_IN_LABEL[w])).toEqual([
      "Try it as text",
      "See it as a picture",
    ]);
  });

  it("names only what this screen can serve", () => {
    const { ways } = waysInFor(
      reteaching([
        route("format", "visual"),
        route("format", "audio"),
        route("simplify"),
        route("slower"),
      ]),
      // A section with a picture and no recording, its text showing with
      // only Slower to offer.
      { formats: ["text", "visual"], densities: ["slower"] },
    );

    expect(ways).toEqual(["picture", "slower"]);
  });

  it("names no pace the section's text does not have", () => {
    const { ways } = waysInFor(
      reteaching([route("simplify"), route("slower")]),
      { formats: ["text", "visual"], densities: [] },
    );

    expect(ways).toEqual([]);
  });

  it("keeps the server's order and names each way once", () => {
    const { ways } = waysInFor(
      reteaching([route("slower"), route("format", "visual"), route("slower")]),
      EVERYTHING,
    );

    expect(ways).toEqual(["slower", "picture"]);
  });

  it("marks the server's suggestion when it is one of them", () => {
    const audio = route("format", "audio");
    const { suggested } = waysInFor(
      reteaching([route("format", "visual"), audio], audio),
      EVERYTHING,
    );

    expect(suggested).toBe("audio");
  });

  it("marks nothing when the suggestion is one never named", () => {
    const rechunk = route("rechunk");
    const { ways, suggested } = waysInFor(
      reteaching([route("format", "visual"), rechunk], rechunk),
      EVERYTHING,
    );

    expect(ways).toEqual(["picture"]);
    expect(suggested).toBeNull();
  });

  it("marks nothing when the suggestion cannot be served here", () => {
    const audio = route("format", "audio");
    const { suggested } = waysInFor(
      reteaching([route("format", "visual"), audio], audio),
      { formats: ["text", "visual"], densities: [] },
    );

    expect(suggested).toBeNull();
  });

  it("names nothing with no re-teaching at all", () => {
    expect(waysInFor(null, EVERYTHING)).toEqual({ ways: [], suggested: null });
    expect(waysInFor(undefined, EVERYTHING)).toEqual({
      ways: [],
      suggested: null,
    });
  });

  it("reads a route with no format as no way", () => {
    expect(wayOf(route("format"))).toBeNull();
    expect(wayOf(null)).toBeNull();
  });
});
