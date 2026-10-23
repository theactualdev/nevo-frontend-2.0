import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MODALITY } from "@/lib/constants";
import { FormatGroup } from "./FormatGroup";

/**
 * THE MARKER NEVER ANIMATES (the 21 Oct format-group brief). The pills carried
 * a colour transition for their hover, so the marker's lavender fill faded in
 * over 150ms whenever the recommendation moved or the current pill changed -
 * found on screen on 21 Oct. Changes land at once.
 */

afterEach(() => {
  cleanup();
});

const FORMATS = [MODALITY.TEXT, MODALITY.AUDIO, MODALITY.VISUAL] as const;

describe("the format pills", () => {
  it("carry no transition, so the marker and the current pill change at once", () => {
    render(
      <FormatGroup
        formats={FORMATS}
        current={MODALITY.TEXT}
        recommended={MODALITY.AUDIO}
        onPick={() => {}}
      />,
    );

    for (const pill of screen.getAllByRole("button")) {
      expect(pill.className).not.toMatch(/\btransition/);
    }
  });

  it("marks the recommended format only where it differs from the current one", () => {
    render(
      <FormatGroup
        formats={FORMATS}
        current={MODALITY.AUDIO}
        recommended={MODALITY.AUDIO}
        onPick={() => {}}
      />,
    );

    for (const pill of screen.getAllByRole("button")) {
      expect(pill.hasAttribute("data-recommended")).toBe(false);
    }
  });
});
