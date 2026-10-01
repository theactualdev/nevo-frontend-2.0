"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { RotatePrompt } from "./RotatePrompt";
import {
  continuesSideways,
  continuesSidewaysOnServer,
  rememberContinuesSideways,
  subscribeContinuesSideways,
} from "./rotatePreference";

/**
 * Hold the app still while the rotate prompt is up.
 *
 * `RotatePrompt` is pure CSS - shown by a media query when a touch device is
 * held landscape - and it COVERS the app without stopping it. The page beneath
 * stayed fully live: every control still in the tab order, every heading still
 * in the accessibility tree, every button still clickable by anything that
 * reaches it. A child on a keyboard or on switch access could tab straight into
 * the lesson they cannot see and activate things blind, and a screen reader
 * read out a page its user had been asked to turn away from - with "Turn your
 * tablet upright" somewhere in the middle of it.
 *
 * Keyboards and switch access are not edge cases here. They are how a good
 * number of the children this is built for drive a tablet at all.
 *
 * `inert` takes the whole subtree out of the tab order AND out of the
 * accessibility tree in one attribute, so the prompt becomes the only thing
 * there is - which is what it looks like. Focus moves to it and returns where
 * it was when the device comes back upright.
 *
 * The prompt itself is left exactly as it was, CSS and all: it must appear the
 * instant the device turns, including before this hydrates. Where JavaScript
 * has not run, or `inert` is not supported, the behaviour is the one that
 * shipped - covered but live - and nothing is worse than it was.
 */
const HELD_SIDEWAYS = "(orientation: landscape) and (pointer: coarse)";

function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia(HELD_SIDEWAYS);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

const clientSnapshot = () => window.matchMedia(HELD_SIDEWAYS).matches;
/** The server cannot know which way a tablet is being held. */
const serverSnapshot = () => false;

/** Children of `body` that are not content and must not be touched. */
const NOT_CONTENT = new Set(["SCRIPT", "STYLE", "LINK", "TEMPLATE", "NEXT-ROUTE-ANNOUNCER"]);

export function RotateLock({ children }: { children: React.ReactNode }) {
  const sideways = useSyncExternalStore(
    subscribe,
    clientSnapshot,
    serverSnapshot,
  );
  /*
   * Has this child already said the tablet does not turn?
   *
   * Read the same way as the orientation, so React owns the server/client
   * difference rather than an effect that would render one frame of a prompt
   * to a child who dismissed it last week.
   */
  const staying = useSyncExternalStore(
    subscribeContinuesSideways,
    continuesSideways,
    continuesSidewaysOnServer,
  );

  const holding = sideways && !staying;
  const app = useRef<HTMLDivElement>(null);
  const prompt = useRef<HTMLDivElement>(null);
  /** Where the child was before the prompt took over. */
  const returnTo = useRef<HTMLElement | null>(null);

  /*
   * AND EVERYTHING PORTALLED OUT OF IT. A sheet, a dialog or the pause card is
   * rendered into `document.body`, outside the subtree above, so an open one
   * stayed live behind the prompt - tabbable, readable, pressable. While the
   * prompt holds, every other child of `body` is made inert too, including
   * one that opens while it is up. Before the focus move below, so a dialog's
   * own focus trap cannot pull focus back into something now inert.
   */
  useEffect(() => {
    if (!holding) return;
    const own = app.current;
    const stilled: Element[] = [];
    const still = (el: Element) => {
      // The app (already inert above) and the prompt, which may each sit
      // directly under `body` - the prompt is the one thing left live.
      if (own && el.contains(own)) return;
      if (prompt.current && el.contains(prompt.current)) return;
      if (el.hasAttribute("inert") || NOT_CONTENT.has(el.tagName)) return;
      el.setAttribute("inert", "");
      stilled.push(el);
    };
    Array.from(document.body.children).forEach(still);
    const watch = new MutationObserver((changes) =>
      changes.forEach((c) =>
        c.addedNodes.forEach((n) => n instanceof Element && still(n)),
      ),
    );
    watch.observe(document.body, { childList: true });
    return () => {
      watch.disconnect();
      stilled.forEach((el) => el.removeAttribute("inert"));
    };
  }, [holding]);

  useEffect(() => {
    if (!holding) return;
    returnTo.current = document.activeElement as HTMLElement | null;
    prompt.current?.focus();
    return () => {
      // By the time this runs the subtree is no longer inert, so the element
      // can take focus again. It may also have gone - a lesson advanced, a
      // dialog closed - in which case `focus()` is a no-op and the browser
      // leaves focus on the body, which is where it would have been anyway.
      returnTo.current?.focus();
      returnTo.current = null;
    };
  }, [holding]);

  return (
    <>
      <div ref={app} inert={holding}>
        {children}
      </div>
      {/*
        Not rendered once the child has said the tablet does not turn. The
        prompt is shown by a media query, so hiding it has to be the absence
        of the element rather than a class - and pre-hydration it still
        appears, which is the behaviour that must not regress.
      */}
      {!staying && (
        <RotatePrompt ref={prompt} onContinue={rememberContinuesSideways} />
      )}
    </>
  );
}
