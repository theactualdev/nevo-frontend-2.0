"use client";

import { useEffect } from "react";

/**
 * Imperative motion layer for the marketing landing page, ported 1:1 from the
 * design frame's logic (`landing page/Nevo Landing Page.dc.html`):
 *
 * - one-shot reveals (`data-reveal="load" | "scroll"` with `data-delay`,
 *   `data-dur`, `data-dy`, `data-dx`) and the masked hero words (`data-word`);
 * - a rAF scroll driver feeding the progress bar, nav condensation, hero
 *   parallax fade, the pinned adaptive-demo scrub and the classroom grid build;
 * - the hero particle canvas, chapter spine, smooth `data-scroll` anchors,
 *   and the desktop custom cursor.
 *
 * Everything honours `prefers-reduced-motion` exactly as the frame does, and
 * every listener/observer/timer/rAF is torn down on unmount so nothing leaks
 * into the app routes.
 */
export function useLandingMotion() {
  useEffect(() => {
    const root = document;
    let alive = true;
    const reduce =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const EASE = "cubic-bezier(0.16,1,0.3,1)";
    const clamp = (v: number, a: number, b: number) =>
      Math.max(a, Math.min(b, v));

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (fn: () => void, ms: number) => {
      const t = setTimeout(() => {
        timers.delete(t);
        if (alive) fn();
      }, ms);
      timers.add(t);
    };
    const observers: IntersectionObserver[] = [];
    const cleanups: (() => void)[] = [];
    const listen = <K extends keyof WindowEventMap>(
      target: Window | Document | HTMLElement,
      ev: K | string,
      fn: EventListenerOrEventListenerObject,
      opts?: AddEventListenerOptions,
    ) => {
      target.addEventListener(ev as string, fn, opts);
      cleanups.push(() => target.removeEventListener(ev as string, fn, opts));
    };

    const scrollTopNow = () =>
      window.scrollY ||
      window.pageYOffset ||
      document.documentElement.scrollTop ||
      document.body.scrollTop ||
      0;

    /*
     * ---- rAF scroll driver ----
     *
     * ALWAYS ON, and it has to be. I replaced this with a scroll-driven loop
     * to stop it reading layout sixty times a second forever, and the page
     * broke: sections went blank and the nav landed in the wrong place.
     *
     * The reason is that `_driver` is not only reading scroll position. It
     * calls `scrubDemo` and `scrubRoom`, which reconcile the transforms of the
     * PINNED sections - and those need reconciling after any layout change,
     * not only after a scroll event. Reveals firing changes content height;
     * fonts landing changes it; images decoding changes it. The continuous
     * loop was quietly absorbing all of that.
     *
     * Making this scroll-driven is still the right optimisation - it is worth
     * roughly 2.5s of main-thread work - but it needs the pinned sections to
     * declare when they are stale rather than being reconciled by brute force.
     * That is a bigger change than a loop rewrite, and it is not this one.
     */
    let _ls = -1;
    let _driver: ((y: number) => void) | null = null;
    const _raf = () => {
      if (!alive) return;
      try {
        const y = scrollTopNow();
        if (_driver && y !== _ls) {
          _ls = y;
          _driver(y);
        }
      } catch {
        // The driver must never take the page down.
      }
      requestAnimationFrame(_raf);
    };
    requestAnimationFrame(_raf);

    // ---- Reveal (masked hero words + scroll reveals) ----
    const words = Array.from(
      root.querySelectorAll<HTMLElement>("[data-word]"),
    );
    const reveals = Array.from(
      root.querySelectorAll<HTMLElement>("[data-reveal]"),
    );
    const hide = (el: HTMLElement) => {
      const dy = parseInt(el.getAttribute("data-dy") || "46", 10);
      const dx = parseInt(el.getAttribute("data-dx") || "0", 10);
      el.style.opacity = "0";
      el.style.transform = `translate(${dx}px,${dy}px) scale(0.975)`;
      el.style.filter = "blur(3px)";
      el.style.willChange = "opacity, transform, filter";
    };
    const show = (el: HTMLElement, dur: number) => {
      el.style.transition = `opacity ${dur}ms ${EASE}, transform ${dur}ms ${EASE}, filter ${dur}ms ${EASE}`;
      el.style.opacity = "1";
      el.style.transform = "none";
      el.style.filter = "none";
    };
    if (reduce) {
      words.forEach((el) => {
        el.style.transform = "none";
      });
      reveals.forEach((el) => {
        el.style.opacity = "1";
        el.style.transform = "none";
      });
    } else {
      // Words SSR visible (LCP); mask them here, reflow, then slide up.
      words.forEach((el) => {
        el.style.transform = "translateY(115%)";
      });
      void root.body?.offsetHeight;
      words.forEach((el) =>
        later(() => {
          el.style.transition = `transform 720ms ${EASE}`;
          el.style.transform = "translateY(0)";
        }, parseInt(el.getAttribute("data-delay") || "0", 10)),
      );
      reveals.forEach(hide);
      reveals
        .filter((el) => el.getAttribute("data-reveal") === "load")
        .forEach((el) =>
          later(
            () =>
              show(
                el,
                Math.round(
                  parseInt(el.getAttribute("data-dur") || "500", 10) * 1.4,
                ),
              ),
            parseInt(el.getAttribute("data-delay") || "0", 10),
          ),
        );
      const scrollEls = reveals.filter(
        (el) => el.getAttribute("data-reveal") === "scroll",
      );
      const done = new Set<HTMLElement>();
      const fire = (el: HTMLElement) => {
        if (done.has(el)) return;
        done.add(el);
        later(
          () =>
            show(
              el,
              Math.round(
                parseInt(el.getAttribute("data-dur") || "560", 10) * 2.4,
              ),
            ),
          parseInt(el.getAttribute("data-delay") || "0", 10),
        );
      };
      if ("IntersectionObserver" in window) {
        const io = new IntersectionObserver(
          (es) =>
            es.forEach((e) => {
              if (e.isIntersecting) fire(e.target as HTMLElement);
            }),
          { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
        );
        scrollEls.forEach((el) => io.observe(el));
        observers.push(io);
      } else scrollEls.forEach(fire);
      const chk = () => {
        const vh = window.innerHeight;
        scrollEls.forEach((el) => {
          if (!done.has(el) && el.getBoundingClientRect().top < vh * 0.9)
            fire(el);
        });
      };
      chk();
      later(chk, 300);
    }

    // ---- Smooth-scroll targets ----
    const scrollTo = (id: string | null) => {
      const t = id ? root.getElementById(id) : null;
      if (t)
        window.scrollTo({
          top: t.getBoundingClientRect().top + (window.scrollY || 0) - 60,
          behavior: reduce ? "auto" : "smooth",
        });
    };
    root.querySelectorAll<HTMLElement>("[data-scroll]").forEach((btn) =>
      listen(btn, "click", () => scrollTo(btn.getAttribute("data-scroll"))),
    );

    // ---- Chapter spine ----
    const spine = root.getElementById("nv-spine");
    const spineItems = Array.from(
      root.querySelectorAll<HTMLElement>(".nv-spine-item"),
    );
    if (window.innerWidth >= 1080 && spine) spine.style.display = "flex";
    spineItems.forEach((it) =>
      listen(it, "click", () => scrollTo(it.getAttribute("data-target"))),
    );
    const setSpine = (activeId: string) => {
      spineItems.forEach((it) => {
        const on = it.getAttribute("data-target") === activeId;
        const num = it.querySelector<HTMLElement>(".nv-spine-num");
        const dash = it.querySelector<HTMLElement>(".nv-spine-dash");
        const lbl = it.querySelector<HTMLElement>(".nv-spine-lbl");
        if (!num || !dash || !lbl) return;
        num.style.color = on ? "#3b3f6e" : "rgba(43,43,47,0.32)";
        dash.style.width = on ? "20px" : "0";
        lbl.style.opacity = on ? "1" : "0";
        lbl.style.color = on ? "#3b3f6e" : "rgba(43,43,47,0.32)";
      });
    };
    const spineTargets = spineItems
      .map((it) => root.getElementById(it.getAttribute("data-target") || ""))
      .filter(Boolean) as HTMLElement[];
    // Reference update (10 Aug): the spine tracks the section nearest the
    // viewport centre via a rAF'd scroll handler - the old IO band lost the
    // active state between tall sections.
    if (spineTargets.length) {
      let spineRaf = 0;
      const updateSpine = () => {
        spineRaf = 0;
        const c = window.innerHeight * 0.5;
        let bestId: string | null = null;
        let bestDist = Infinity;
        spineTargets.forEach((s) => {
          const r = s.getBoundingClientRect();
          if (r.top <= c && r.bottom >= c) {
            bestId = s.id;
            bestDist = -1;
          } else if (bestDist !== -1) {
            const d = Math.min(Math.abs(r.top - c), Math.abs(r.bottom - c));
            if (d < bestDist) {
              bestDist = d;
              bestId = s.id;
            }
          }
        });
        if (bestId) setSpine(bestId);
      };
      const queueSpine = () => {
        if (!spineRaf) spineRaf = requestAnimationFrame(updateSpine);
      };
      listen(window, "scroll", queueSpine, { passive: true });
      listen(window, "resize", queueSpine);
      cleanups.push(() => cancelAnimationFrame(spineRaf));
      updateSpine();
    }

    // ---- Progress + nav + hero parallax ----
    const prog = root.getElementById("nv-progress");
    const nav = root.getElementById("nv-nav");
    const heroContent = root.getElementById("nv-hero-content");
    const cue = root.getElementById("nv-cue");
    const heroSec = root.getElementById("nv-open");
    const setCue = () => {
      if (cue) cue.style.display = window.innerHeight < 720 ? "none" : "";
    };
    setCue();
    listen(window, "resize", setCue, { passive: true });
    const update = (y: number) => {
      const vh = window.innerHeight;
      const h = document.documentElement.scrollHeight - vh;
      if (prog) prog.style.width = (h > 0 ? (y / h) * 100 : 0) + "%";
      if (nav) {
        if (y > 40) {
          nav.style.background = "rgba(237,232,220,0.82)";
          nav.style.boxShadow = "0 10px 30px rgba(43,43,47,0.12)";
        } else {
          nav.style.background = "transparent";
          nav.style.boxShadow = "none";
        }
      }
      if (heroContent && y < vh) {
        const p = y / vh;
        heroContent.style.transform = `translateY(${y * 0.28}px)`;
        heroContent.style.opacity = String(clamp(1 - p * 1.4, 0, 1));
        if (cue) cue.style.opacity = String(clamp(1 - p * 3, 0, 1));
      }
      scrubDemo(y, vh);
      scrubRoom(y, vh);
    };
    const onScroll = () => update(scrollTopNow());

    // ---- Hero particle field ----
    const canvas = root.getElementById("nv-canvas") as HTMLCanvasElement | null;
    if (canvas && !reduce) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        let W = 0;
        let H = 0;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        type Dot = {
          x: number;
          y: number;
          r: number;
          ph: number;
          sp: number;
          amp: number;
          depth: number;
          violet: boolean;
        };
        let dots: Dot[] = [];
        let mx = 0;
        let my = 0;
        let tmx = 0;
        let tmy = 0;
        const build = () => {
          const r = canvas.getBoundingClientRect();
          W = r.width;
          H = r.height;
          canvas.width = W * dpr;
          canvas.height = H * dpr;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          const n = Math.max(38, Math.min(74, Math.round((W * H) / 18000)));
          dots = [];
          for (let i = 0; i < n; i++) {
            const rad = 1.2 + Math.random() * 3.6;
            dots.push({
              x: Math.random() * W,
              y: Math.random() * H,
              r: rad,
              ph: Math.random() * Math.PI * 2,
              sp: 0.14 + Math.random() * 0.5,
              amp: 4 + Math.random() * 13,
              depth: rad / 4.8,
              violet: Math.random() < 0.2,
            });
          }
        };
        build();
        const t0 = performance.now();
        /*
         * The hero field animates ONLY while the hero is on screen.
         *
         * This loop used to re-arm unconditionally, so the particles carried
         * on being drawn at 60fps for the whole session - long after the hero
         * had scrolled away and nobody could see a single one of them. On a
         * long landing page that is most of the page's life.
         *
         * `onScreen` is flipped by an IntersectionObserver below; when it goes
         * false the loop simply stops re-arming, and starting it again is one
         * `requestAnimationFrame`.
         */
        let onScreen = true;
        let drawing = 0;
        const draw = (t: number) => {
          drawing = 0;
          if (!alive || !onScreen) return;
          const el = (t - t0) / 1000;
          ctx.clearRect(0, 0, W, H);
          mx += (tmx - mx) * 0.06;
          my += (tmy - my) * 0.06;
          for (const d of dots) {
            const ox = mx * d.depth * 38;
            const oy = my * d.depth * 38 + Math.sin(el * d.sp + d.ph) * d.amp;
            ctx.beginPath();
            ctx.arc(d.x + ox, d.y + oy, d.r, 0, Math.PI * 2);
            ctx.fillStyle = d.violet
              ? "rgba(154,156,203,0.5)"
              : "rgba(59,63,110,0.22)";
            ctx.fill();
          }
          drawing = requestAnimationFrame(draw);
        };
        const startDraw = () => {
          if (!drawing && alive && onScreen) drawing = requestAnimationFrame(draw);
        };
        startDraw();

        if ("IntersectionObserver" in window) {
          const vis = new IntersectionObserver(
            (entries) => {
              onScreen = entries.some((e) => e.isIntersecting);
              if (onScreen) startDraw();
            },
            // A small margin so it is already running by the time it is seen.
            { rootMargin: "120px" },
          );
          vis.observe(canvas);
          observers.push(vis);
        }
        cleanups.push(() => {
          if (drawing) cancelAnimationFrame(drawing);
        });
        listen(window, "resize", build, { passive: true });
        if (heroSec) {
          listen(heroSec, "mousemove", ((e: MouseEvent) => {
            const r = canvas.getBoundingClientRect();
            tmx = ((e.clientX - r.left) / r.width - 0.5) * 2;
            tmy = ((e.clientY - r.top) / r.height - 0.5) * 2;
          }) as EventListener);
          listen(heroSec, "mouseleave", () => {
            tmx = 0;
            tmy = 0;
          });
        }
      }
    } else if (canvas) canvas.style.display = "none";

    // ---- Classroom field (scroll-built) ----
    const room = root.getElementById("nv-room");
    let roomTiles: HTMLElement[] = [];
    const tileInner = (kind: string) =>
      kind === "text"
        ? '<div style="display:flex;flex-direction:column;gap:4px;width:58%;"><span style="height:4px;width:42%;background:rgba(59,63,110,0.55);border-radius:2px;"></span><span style="height:3px;background:rgba(59,63,110,0.34);border-radius:2px;margin-top:2px;"></span><span style="height:3px;width:88%;background:rgba(59,63,110,0.34);border-radius:2px;"></span><span style="height:3px;width:66%;background:rgba(59,63,110,0.34);border-radius:2px;"></span></div>'
        : kind === "audio"
          ? '<div style="display:flex;align-items:center;gap:2px;height:16px;">' +
            [5, 10, 16, 8, 13, 6]
              .map(
                (hh) =>
                  `<span style="width:2px;height:${hh}px;background:rgba(154,156,203,0.85);border-radius:1px;"></span>`,
              )
              .join("") +
            "</div>"
          : '<div style="display:flex;align-items:center;gap:4px;"><span style="width:6px;height:6px;border-radius:999px;background:rgba(59,63,110,0.5);"></span><span style="width:6px;height:6px;border-radius:999px;background:rgba(59,63,110,0.3);"></span><span style="width:6px;height:6px;border-radius:999px;background:rgba(59,63,110,0.5);"></span></div>';
    if (room) {
      room.replaceChildren(); // StrictMode re-run safety - never double-build.
      const kinds = ["text", "audio", "visual"];
      const COLS = 6;
      const ROWS = 6;
      const bigs: Record<string, [number, number]> = {
        "0,0": [2, 2],
        "0,4": [1, 2],
        "2,0": [2, 1],
        "2,3": [2, 2],
        "4,0": [1, 2],
        "4,4": [2, 2],
      };
      const occ = Array.from({ length: ROWS }, () =>
        Array<boolean>(COLS).fill(false),
      );
      let ci = 0;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (occ[r][c]) continue;
          const sp = bigs[r + "," + c];
          const w = sp ? sp[0] : 1;
          const h = sp ? sp[1] : 1;
          for (let rr = r; rr < r + h; rr++)
            for (let cc = c; cc < c + w; cc++) occ[rr][cc] = true;
          const kind = kinds[(r * 2 + c + ci) % 3];
          ci++;
          const tile = document.createElement("div");
          tile.style.cssText = `grid-column:${c + 1} / span ${w};grid-row:${r + 1} / span ${h};border-radius:8px;background:rgba(59,63,110,0.05);border:1px solid rgba(59,63,110,0.1);display:flex;align-items:center;justify-content:center;opacity:0;transform:scale(0.82);transition:opacity 420ms ${EASE}, transform 420ms ${EASE};`;
          tile.innerHTML = `<div style="transition:opacity 260ms ease;">${tileInner(kind)}</div>`;
          room.appendChild(tile);
        }
      }
      room.style.gap = "10px";
      roomTiles = Array.from(room.children) as HTMLElement[];
      const sizeRoom = () => {
        const w = room.clientWidth;
        if (!w) return;
        const cell = (w - 50) / 6;
        room.style.gridTemplateRows = `repeat(6,${cell}px)`;
      };
      sizeRoom();
      later(sizeRoom, 60);
      later(sizeRoom, 400);
      listen(window, "resize", sizeRoom, { passive: true });
      if (reduce)
        roomTiles.forEach((t) => {
          t.style.opacity = "1";
          t.style.transform = "none";
        });
    }
    let morphTimer: ReturnType<typeof setInterval> | null = null;
    const startMorph = () => {
      if (morphTimer || reduce || !roomTiles.length) return;
      const kinds = ["text", "audio", "visual"];
      morphTimer = setInterval(() => {
        const vis = roomTiles.filter((t) => t.style.opacity === "1");
        if (!vis.length) return;
        const t = vis[Math.floor(Math.random() * vis.length)];
        const box = t.firstElementChild as HTMLElement | null;
        if (!box) return;
        const nk = kinds[Math.floor(Math.random() * 3)];
        box.style.transition = `opacity 620ms ease, transform 760ms ${EASE}`;
        box.style.opacity = "0";
        box.style.transform = "scale(0.9)";
        t.style.transition = "background 900ms ease, border-color 900ms ease";
        t.style.background = "rgba(154,156,203,0.22)";
        t.style.borderColor = "rgba(154,156,203,0.4)";
        later(() => {
          box.innerHTML = tileInner(nk);
          box.style.opacity = "1";
          box.style.transform = "scale(1)";
          later(() => {
            t.style.background = "rgba(59,63,110,0.05)";
            t.style.borderColor = "rgba(59,63,110,0.1)";
          }, 1200);
        }, 560);
      }, 5200);
    };
    let roomShown = 0;
    const scrubRoom = (y: number, vh: number) => {
      if (!roomTiles.length || reduce) return;
      const sec = root.getElementById("nv-classroom");
      if (!sec) return;
      const rect = sec.getBoundingClientRect();
      const p = clamp((vh - rect.top) / (vh * 0.85), 0, 1);
      const target = Math.round(p * roomTiles.length);
      if (target > roomShown) {
        for (let i = roomShown; i < target; i++) {
          roomTiles[i].style.opacity = "1";
          roomTiles[i].style.transform = "none";
        }
        roomShown = target;
      }
      if (roomShown >= roomTiles.length) startMorph();
    };

    // ---- Adaptive demo: scroll-driven pinned scrub ----
    const track = root.getElementById("nv-adapt-track");
    const pin = root.getElementById("nv-pin");
    if (pin) {
      pin.style.position = "absolute";
      pin.style.top = "0";
      pin.style.left = "0";
      pin.style.width = "100%";
    }
    const stage = root.getElementById("nv-stage");
    const panels = Array.from(root.querySelectorAll<HTMLElement>(".nv-panel"));
    const rails = Array.from(root.querySelectorAll<HTMLElement>(".nv-rail"));
    const thumb = root.getElementById("nv-railthumb");
    let curPhase = -1;
    // On viewports too short for the pinned scrub (small phones), the section
    // falls back to normal flow and the rail buttons switch panels directly.
    let adaptStatic = false;
    const sizeStage = () => {
      if (!stage || !panels.length) return;
      let mh = 0;
      panels.forEach((p) => {
        const prev = p.style.opacity;
        p.style.opacity = "1";
        mh = Math.max(mh, p.offsetHeight);
        p.style.opacity = prev;
      });
      stage.style.minHeight = mh + "px";
    };
    const setPhase = (idx: number) => {
      if (idx === curPhase) return;
      panels.forEach((p, i) => {
        const on = i === idx;
        p.style.transition = `opacity 460ms ${EASE}, transform 460ms ${EASE}`;
        p.style.opacity = on ? "1" : "0";
        p.style.transform = on ? "none" : "translateY(12px)";
        p.style.pointerEvents = on ? "auto" : "none";
      });
      rails.forEach((r, i) => {
        const nm = r.querySelector<HTMLElement>(".nv-rail-name");
        if (!nm) return;
        const on = i === idx;
        nm.style.color = on ? "#3b3f6e" : "rgba(43,43,47,0.4)";
        nm.style.fontWeight = on ? "600" : "500";
      });
      curPhase = idx;
    };
    const applyAdaptMode = () => {
      if (!track || !pin) return;
      const cs = getComputedStyle(pin);
      const need = Array.from(pin.children).reduce(
        (sum, kid) => {
          const m = getComputedStyle(kid);
          return (
            sum +
            (kid as HTMLElement).offsetHeight +
            parseFloat(m.marginTop) +
            parseFloat(m.marginBottom)
          );
        },
        parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom),
      );
      const wantStatic = need > window.innerHeight + 2;
      if (wantStatic === adaptStatic) return;
      adaptStatic = wantStatic;
      if (wantStatic) {
        track.style.height = "auto";
        pin.style.position = "relative";
        pin.style.top = "";
        pin.style.height = "auto";
      } else {
        track.style.height = "300vh";
        pin.style.position = "absolute";
        pin.style.top = "0";
        pin.style.height = "100vh";
      }
    };
    const scrubDemo = (y: number, vh: number) => {
      if (!track || !panels.length || adaptStatic) return;
      const rect = track.getBoundingClientRect();
      const range = Math.max(1, track.offsetHeight - vh);
      if (pin) {
        if (rect.top > 0) {
          pin.style.position = "absolute";
          pin.style.top = "0";
        } else if (-rect.top < range) {
          pin.style.position = "fixed";
          pin.style.top = "0";
        } else {
          pin.style.position = "absolute";
          pin.style.top = range + "px";
        }
      }
      const p = clamp(-rect.top / range, 0, 1);
      if (thumb) thumb.style.left = p * 100 + "%";
      const idx = p < 0.34 ? 0 : p < 0.67 ? 1 : 2;
      setPhase(idx);
    };
    if (stage) {
      panels.forEach((p, i) => {
        p.style.opacity = i === 0 ? "1" : "0";
        p.style.pointerEvents = i === 0 ? "auto" : "none";
      });
      const fitStage = () => {
        sizeStage();
        applyAdaptMode();
      };
      later(fitStage, 60);
      later(fitStage, 500);
      if ("fonts" in document && document.fonts?.ready)
        document.fonts.ready.then(() => {
          if (alive) fitStage();
        });
      let rs: ReturnType<typeof setTimeout> | undefined;
      listen(window, "resize", () => {
        if (rs) clearTimeout(rs);
        rs = setTimeout(() => {
          if (alive) fitStage();
        }, 120);
      });
      cleanups.push(() => {
        if (rs) clearTimeout(rs);
      });
      curPhase = 0;
      // Rail click -> scroll to that phase's centre of the scrub track.
      rails.forEach((r) =>
        listen(r, "click", () => {
          if (!track) return;
          const ph = parseInt(r.getAttribute("data-phase") || "0", 10);
          if (adaptStatic) {
            setPhase(ph);
            if (thumb) thumb.style.left = (ph / 2) * 100 + "%";
            return;
          }
          const range = track.offsetHeight - window.innerHeight;
          const top =
            track.getBoundingClientRect().top +
            (window.scrollY || 0) +
            ((ph + 0.5) / 3) * range;
          window.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
        }),
      );
    }

    listen(window, "scroll", onScroll, { passive: true });
    listen(document, "scroll", onScroll, { passive: true, capture: true });
    _driver = update;
    onScroll();

    // ---- Responsive nav links ----
    // Sign up is exempt. It is an <a> in the same row, so a bare
    // `#nv-navlinks a` swept it in: under 720px this hid the one CTA a school
    // on a phone needs, and above it the `display = ""` wiped its inline-flex,
    // pinning the label to the top of the button.
    const navLinkEls = Array.from(
      root.querySelectorAll<HTMLElement>("#nv-navlinks a:not(.nv-signup)"),
    );
    const setNavLinks = () =>
      navLinkEls.forEach((a) => {
        a.style.display = window.innerWidth < 720 ? "none" : "";
      });
    setNavLinks();
    listen(window, "resize", setNavLinks, { passive: true });

    // ---- Custom cursor (desktop, fine pointers only) ----
    if (
      window.matchMedia &&
      window.matchMedia("(pointer:fine)").matches &&
      !reduce
    ) {
      const ring = document.createElement("div");
      ring.style.cssText =
        "position:fixed;top:0;left:0;width:30px;height:30px;margin:-15px 0 0 -15px;border:2px solid #9a9ccb;border-radius:999px;pointer-events:none;z-index:99999;box-shadow:0 0 0 1px rgba(43,43,47,0.06);transition:width 170ms ease, height 170ms ease, margin 170ms ease, background 170ms ease;";
      const dot = document.createElement("div");
      dot.style.cssText =
        "position:fixed;top:0;left:0;width:7px;height:7px;margin:-3.5px 0 0 -3.5px;background:#9a9ccb;border-radius:999px;pointer-events:none;z-index:99999;";
      document.body.appendChild(ring);
      document.body.appendChild(dot);
      const prevCursor = document.body.style.cursor;
      document.body.style.cursor = "none";
      let rx = window.innerWidth / 2;
      let ry = window.innerHeight / 2;
      let tx = rx;
      let ty = ry;
      listen(
        document,
        "mousemove",
        ((e: MouseEvent) => {
          tx = e.clientX;
          ty = e.clientY;
          dot.style.left = tx + "px";
          dot.style.top = ty + "px";
        }) as EventListener,
        { passive: true },
      );
      const rl = () => {
        if (!alive) return;
        rx += (tx - rx) * 0.22;
        ry += (ty - ry) * 0.22;
        ring.style.left = rx + "px";
        ring.style.top = ry + "px";
        requestAnimationFrame(rl);
      };
      requestAnimationFrame(rl);
      listen(
        document,
        "mouseover",
        ((e: MouseEvent) => {
          const target = e.target as HTMLElement | null;
          const on = target?.closest?.(
            "button,a,input,textarea,select,[data-scroll],.nv-rail",
          );
          if (on) {
            ring.style.width = "48px";
            ring.style.height = "48px";
            ring.style.margin = "-24px 0 0 -24px";
            ring.style.background = "rgba(154,156,203,0.26)";
          } else {
            ring.style.width = "30px";
            ring.style.height = "30px";
            ring.style.margin = "-15px 0 0 -15px";
            ring.style.background = "transparent";
          }
        }) as EventListener,
        { passive: true },
      );
      cleanups.push(() => {
        ring.remove();
        dot.remove();
        document.body.style.cursor = prevCursor;
      });
    }
    listen(
      window,
      "resize",
      () => {
        if (spine)
          spine.style.display = window.innerWidth >= 1080 ? "flex" : "none";
        sizeStage();
        applyAdaptMode();
        onScroll();
      },
      { passive: true },
    );

    return () => {
      alive = false;
      _driver = null;
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      if (morphTimer) clearInterval(morphTimer);
      observers.forEach((io) => io.disconnect());
      cleanups.forEach((fn) => fn());
    };
  }, []);
}
