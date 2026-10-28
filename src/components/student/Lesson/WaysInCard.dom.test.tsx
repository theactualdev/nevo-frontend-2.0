import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WaysInCard } from "./WaysInCard";

/**
 * 17d S1-S2, as the Lesson Player frame draws `showWaysIn`: the heading, the
 * line under it, one button per way in design's words, and the spark on the
 * server's suggestion only.
 */

afterEach(cleanup);

describe("the ways-in card", () => {
  it("says it in the frame's words, with a button per way", () => {
    render(
      <WaysInCard ways={["picture", "slower"]} suggested={null} onTake={vi.fn()} />,
    );

    expect(screen.getByText("Let's try this another way.")).toBeInTheDocument();
    expect(
      screen.getByText("Take any of these, in any order, as many times as you like."),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button").map((b) => b.getAttribute("aria-label")),
    ).toEqual(["See it as a picture", "One step at a time"]);
  });

  it("marks the suggestion, and only it", () => {
    render(
      <WaysInCard
        ways={["picture", "audio"]}
        suggested="audio"
        onTake={vi.fn()}
      />,
    );

    const audio = screen.getByRole("button", { name: "Listen to it" });
    const picture = screen.getByRole("button", { name: "See it as a picture" });
    expect(audio).toHaveAttribute("data-suggested", "true");
    expect(audio.querySelector("svg")).not.toBeNull();
    expect(picture).not.toHaveAttribute("data-suggested");
    expect(picture.querySelector("svg")).toBeNull();
  });

  it("hands back the way taken", () => {
    const onTake = vi.fn();
    render(<WaysInCard ways={["simpler"]} suggested={null} onTake={onTake} />);

    fireEvent.click(screen.getByRole("button", { name: "A simpler version" }));

    expect(onTake).toHaveBeenCalledWith("simpler");
  });

  it("draws nothing with no ways to offer", () => {
    const { container } = render(
      <WaysInCard ways={[]} suggested={null} onTake={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("says no count and no verdict", () => {
    const { container } = render(
      <WaysInCard
        ways={["picture", "audio", "activity", "simpler"]}
        suggested="picture"
        onTake={vi.fn()}
      />,
    );

    expect(container.textContent).not.toMatch(
      /wrong|incorrect|again|attempt|\d/i,
    );
  });
});
