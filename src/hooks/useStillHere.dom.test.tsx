import { StrictMode, useEffect, useState } from "react";
import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { useStillHere } from "./useStillHere";

/**
 * The shared unmount guard (8 Nov; check 21's admin reads): true while the
 * component is on screen,
 * false once it has gone - including through Strict Mode's mount, cleanup and
 * mount again, after which it must be true.
 */

let seen: { readonly current: boolean } | null = null;

function Probe() {
  const mounted = useStillHere();
  // Handed out from an effect, not during render.
  useEffect(() => {
    seen = mounted;
  }, [mounted]);
  return <p>probe</p>;
}

describe("useStillHere", () => {
  it("is true while mounted and false once unmounted", () => {
    const view = render(<Probe />);
    expect(seen?.current).toBe(true);
    const ref = seen;
    view.unmount();
    expect(ref?.current).toBe(false);
  });

  it("is true again after Strict Mode's mount, cleanup and remount", () => {
    const view = render(
      <StrictMode>
        <Probe />
      </StrictMode>,
    );
    expect(seen?.current).toBe(true);
    const ref = seen;
    view.unmount();
    expect(ref?.current).toBe(false);
  });

  it("lets a read that answers after unmount set nothing", async () => {
    let answer: (v: string) => void = () => {};
    let setAfter = false;
    function Reader() {
      const mounted = useStillHere();
      const [text, setText] = useState("waiting");
      useEffect(() => {
        new Promise<string>((resolve) => {
          answer = resolve;
        }).then((v) => {
          if (!mounted.current) return;
          setAfter = true;
          setText(v);
        });
      }, [mounted]);
      return <p>{text}</p>;
    }
    const view = render(<Reader />);
    expect(screen.getByText("waiting")).toBeInTheDocument();
    view.unmount();
    await act(async () => {
      answer("late");
    });
    expect(setAfter).toBe(false);
  });

  it("still lets a read that answers while mounted set its state", async () => {
    let answer: (v: string) => void = () => {};
    function Reader() {
      const mounted = useStillHere();
      const [text, setText] = useState("waiting");
      useEffect(() => {
        new Promise<string>((resolve) => {
          answer = resolve;
        }).then((v) => {
          if (!mounted.current) return;
          setText(v);
        });
      }, [mounted]);
      return <p>{text}</p>;
    }
    render(
      <StrictMode>
        <Reader />
      </StrictMode>,
    );
    await act(async () => {
      answer("on time");
    });
    expect(screen.getByText("on time")).toBeInTheDocument();
  });
});
