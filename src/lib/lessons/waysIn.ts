import type { ReteachingResponse, TeachingRoute } from "@/lib/api/lessons";
import {
  DENSITY,
  MODALITY,
  type Density,
  type Modality,
} from "@/lib/constants/lessonModality";

/**
 * THE WAYS IN, AFTER A MISS UNDER THE GATE (SCRUM-282; 17d S1-S3).
 *
 * The server names the routes a section has (`reteaching.availableRoutes`)
 * and the one it suggests (`recommendedRoute`). This only decides which of
 * them THIS SCREEN CAN SERVE RIGHT NOW, and what each is called - nothing is
 * chosen, ranked or counted here (rule 3), and a route the screen cannot
 * serve is never named (Lydia, 23 Oct: "name only the ways in this screen can
 * actually serve").
 *
 * IN DESIGN'S WORDS, NOT THE SERVER'S. The Lesson Player frame takes the
 * route as a token and draws its own label for it ("Tokens come from the
 * backend"): "See it as a picture", not the server's "Try it as a picture".
 *
 * NAMED, AND NOT:
 *  - a format, Simplify and Slower are named, because they are the child's
 *    own controls and a child knows what they mean (17d S3);
 *  - `rechunk` and `simpler_presentation` are never named: re-chunking
 *    "happens without being announced" (17d S3-S4);
 *  - `panel` waits: the panel's marking is held for the teacher review of
 *    guided steps (Lydia, 24 Oct), and it is never named unless the question
 *    has markable steps;
 *  - `calculation_scaffold` belongs to the calculation screen, not this card;
 *  - a TEXT format route has no words in the frame, so it is not named.
 */
export type WayIn = "picture" | "audio" | "activity" | "simpler" | "slower";

/** The Lesson Player frame's words for each (17d; `wTok`). */
export const WAY_IN_LABEL: Record<WayIn, string> = {
  picture: "See it as a picture",
  audio: "Listen to it",
  activity: "Try it yourself",
  simpler: "A simpler version",
  slower: "One step at a time",
};

/** What each way presses: a format in the format group, or a pace chip. */
export const WAY_IN_PRESSES: Record<
  WayIn,
  { format: Modality } | { density: Density }
> = {
  picture: { format: MODALITY.VISUAL },
  audio: { format: MODALITY.AUDIO },
  activity: { format: MODALITY.INTERACTIVE },
  simpler: { density: DENSITY.SIMPLIFY },
  slower: { density: DENSITY.SLOWER },
};

/** The way a route is, or null for one this card never names. */
export function wayOf(route: TeachingRoute | null | undefined): WayIn | null {
  if (!route) return null;
  switch (route.action) {
    case "format":
      if (route.format === MODALITY.VISUAL) return "picture";
      if (route.format === MODALITY.AUDIO) return "audio";
      if (route.format === MODALITY.INTERACTIVE) return "activity";
      return null;
    case "simplify":
      return "simpler";
    case "slower":
      return "slower";
    default:
      return null;
  }
}

/** What this screen can serve right now. */
export interface ServedHere {
  /** The formats the section's own format group offers. */
  formats: readonly Modality[];
  /** The pace chips on screen - none while the text is not what shows. */
  densities: readonly Density[];
}

/**
 * The ways in to name, in the server's order, and the one to mark - or none
 * (`suggested: null`) when the server's suggestion is not one of them.
 */
export function waysInFor(
  reteaching: ReteachingResponse | null | undefined,
  served: ServedHere,
): { ways: WayIn[]; suggested: WayIn | null } {
  const ways: WayIn[] = [];
  for (const route of reteaching?.availableRoutes ?? []) {
    const way = wayOf(route);
    if (!way || ways.includes(way)) continue;
    const presses = WAY_IN_PRESSES[way];
    const servable =
      "format" in presses
        ? served.formats.includes(presses.format)
        : served.densities.includes(presses.density);
    if (servable) ways.push(way);
  }
  const marked = wayOf(reteaching?.recommendedRoute);
  return {
    ways,
    suggested: marked && ways.includes(marked) ? marked : null,
  };
}
