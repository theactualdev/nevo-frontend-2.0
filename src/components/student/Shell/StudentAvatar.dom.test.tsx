import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { StudentAvatar } from "./StudentAvatar";
import { avatarLook } from "@/lib/profile/avatarLook";

/**
 * THE ONE AVATAR (SCRUM-324), drawn as the design's `Nevo Avatar` (928cf30).
 */

afterEach(cleanup);

const glyph = () => document.querySelector("svg[data-avatar-shape]") as SVGElement;

describe("the one avatar", () => {
  it("fills 58% of a tile under 56px, and 46% at 56px and up", () => {
    // "In a dense roster row a 46 per cent hexagon reads as a circle."
    render(<StudentAvatar look={avatarLook("hexagon-navy")} size={40} />);
    expect(glyph().style.width).toBe("58%");
    cleanup();

    render(<StudentAvatar look={avatarLook("hexagon-navy")} size={56} />);
    expect(glyph().style.width).toBe("46%");
  });

  it("draws the star, and the rounded square with its tighter corners", () => {
    render(<StudentAvatar look={avatarLook("star-navy")} size={64} />);
    expect(glyph().getAttribute("data-avatar-shape")).toBe("star");
    expect(glyph().querySelector("path")?.getAttribute("d")).toMatch(/^M12\.00 2\.70/);
    cleanup();

    render(<StudentAvatar look={avatarLook("square-navy")} size={64} />);
    expect(glyph().querySelector("rect")?.getAttribute("rx")).toBe("3.5");
  });

  it("wears its tone: the glyph on the tile, and cream's hairline ring", () => {
    render(<StudentAvatar look={avatarLook("triangle-cream_elevated")} size={46} />);
    const tile = document.querySelector("[data-avatar-look]") as HTMLElement;

    expect(tile.style.background).toBe("rgb(237, 232, 220)");
    expect(tile.style.color).toBe("rgb(59, 63, 110)");
    expect(tile.style.boxShadow).toContain("inset");
  });

  it("is the navy circle when it is given no look", () => {
    render(<StudentAvatar size={64} />);

    expect(
      document.querySelector("[data-avatar-look]")?.getAttribute("data-avatar-look"),
    ).toBe("circle-navy");
  });
});
