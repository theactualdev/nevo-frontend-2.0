import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { compile } from "tailwindcss";

/**
 * The app's stylesheet as the build compiles it, and what it says an element
 * gets at a given window - for rules jsdom cannot answer, because it applies no
 * media query and no stylesheet. Reading `globals.css` as text says a rule is
 * written; this says what it DOES at 1023px and at 1024px, inside a letterbox
 * and out of one, after Tailwind has expanded every variant.
 */

const ROOT = process.cwd();
const GLOBALS = join(ROOT, "src", "app", "globals.css");
/** `globals.css`'s own imports, by the files their packages export. */
const IMPORTS: Record<string, string> = {
  tailwindcss: "tailwindcss/index.css",
  "tw-animate-css": "tw-animate-css/dist/tw-animate.css",
  "shadcn/tailwind.css": "shadcn/dist/tailwind.css",
};

/** `globals.css` compiled by Tailwind with these class names in use. */
export async function compiledCss(candidates: string[] = []): Promise<string> {
  const compiler = await compile(readFileSync(GLOBALS, "utf8"), {
    base: dirname(GLOBALS),
    loadStylesheet: async (id: string, base: string) => {
      const path = IMPORTS[id]
        ? join(ROOT, "node_modules", IMPORTS[id])
        : resolve(base, id);
      return { path, base: dirname(path), content: readFileSync(path, "utf8") };
    },
  });
  return compiler.build(candidates);
}

/** The rule selector Tailwind writes for a class name. */
export function classSelector(candidate: string): string {
  const escaped = candidate.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
  // A leading digit is written as a code point: `2xl:` is `.\32 xl\:`.
  return "." + escaped.replace(/^[0-9]/, (d) => `\\3${d} `);
}

/**
 * A window, the pointer that drives it, and whether the element sits inside
 * a letterbox.
 */
export type Viewport = {
  width: number;
  height?: number;
  orientation?: "portrait" | "landscape";
  pointer?: "fine" | "coarse";
  inLetterbox?: boolean;
};

type Node = { header: string; nodes: Node[]; decls: string[] };

function parse(css: string): Node {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const root: Node = { header: "", nodes: [], decls: [] };
  const stack = [root];
  let buf = "";
  let quote: string | null = null;
  let parens = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\") {
      buf += ch + (text[i + 1] ?? "");
      i++;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      buf += ch;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") parens++;
    else if (ch === ")") parens--;
    else if (parens === 0 && ch === "{") {
      const node: Node = { header: buf.trim(), nodes: [], decls: [] };
      stack[stack.length - 1].nodes.push(node);
      stack.push(node);
      buf = "";
      continue;
    } else if (parens === 0 && ch === "}") {
      if (buf.trim()) stack[stack.length - 1].decls.push(buf.trim());
      stack.pop();
      buf = "";
      continue;
    } else if (parens === 0 && ch === ";") {
      if (buf.trim()) stack[stack.length - 1].decls.push(buf.trim());
      buf = "";
      continue;
    }
    buf += ch;
  }
  return root;
}

/** A selector list split at its top-level commas, escapes respected. */
function selectors(header: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < header.length; i++) {
    const ch = header[i];
    if (ch === "\\") {
      cur += ch + (header[i + 1] ?? "");
      i++;
      continue;
    }
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const px = (n: string, unit: string) => Number(n) * (unit === "rem" ? 16 : 1);

/** Does this one media feature hold at the viewport? */
function feature(f: string, at: Required<Viewport>): boolean {
  let m = /^\((width|height) (>=|<) ([\d.]+)(rem|px)\)$/.exec(f);
  if (m) {
    const size = m[1] === "width" ? at.width : at.height;
    const bound = px(m[3], m[4]);
    return m[2] === ">=" ? size >= bound : size < bound;
  }
  m = /^\((max|min)-(width|height): ?([\d.]+)(rem|px)\)$/.exec(f);
  if (m) {
    const size = m[2] === "width" ? at.width : at.height;
    const bound = px(m[3], m[4]);
    return m[1] === "max" ? size <= bound : size >= bound;
  }
  m = /^\(orientation: ?(portrait|landscape)\)$/.exec(f);
  if (m) return at.orientation === m[1];
  m = /^\(pointer: ?(fine|coarse)\)$/.exec(f);
  if (m) return at.pointer === m[1];
  throw new Error(`compiledCss: no answer for the media feature ${f}`);
}

/**
 * Does this block's condition hold? `layer` for a cascade layer, which always
 * holds and loses to an unlayered rule.
 */
function holds(header: string, at: Required<Viewport>): boolean | "layer" {
  if (header.startsWith("@layer")) return "layer";
  if (header.startsWith("@media")) {
    return header
      .slice("@media".length)
      .trim()
      .split(/\s+and\s+/)
      .every((f) => feature(f.trim(), at));
  }
  if (header === "&:where(:not([data-nevo-letterbox] *))") return !at.inLetterbox;
  if (header === "&:where([data-nevo-letterbox] *)") return at.inLetterbox;
  throw new Error(`compiledCss: no answer for the block ${header}`);
}

/**
 * What an element matching any of `targets` gets at the viewport: each
 * property's winning value, an unlayered rule beating a layered one and a
 * later rule an earlier one, as the cascade has it between rules of equal
 * weight. `targets` are rule selectors as compiled - `classSelector(...)`,
 * or an attribute selector written in `globals.css`.
 */
export function styleAt(
  css: string,
  targets: string[],
  viewport: Viewport,
): Record<string, string> {
  const height = viewport.height ?? 900;
  const at: Required<Viewport> = {
    width: viewport.width,
    height,
    orientation:
      viewport.orientation ??
      (viewport.width > height ? "landscape" : "portrait"),
    pointer: viewport.pointer ?? "fine",
    inLetterbox: viewport.inLetterbox ?? false,
  };
  const won = new Map<string, { value: string; layered: boolean }>();
  const take = (decls: string[], layered: boolean) => {
    for (const d of decls) {
      const i = d.indexOf(":");
      if (i < 0) continue;
      const prop = d.slice(0, i).trim();
      const value = d.slice(i + 1).trim();
      const before = won.get(prop);
      if (before && !before.layered && layered) continue;
      won.set(prop, { value, layered });
    }
  };
  /** Inside a matched rule: its own declarations and its nested conditions. */
  const inside = (node: Node, layered: boolean) => {
    take(node.decls, layered);
    for (const child of node.nodes) {
      const ok = holds(child.header, at);
      if (ok === false) continue;
      inside(child, layered || ok === "layer");
    }
  };
  // The blocks around a rule are only asked about once the rule is one of
  // the targets, so a query this does not model elsewhere in the sheet (a
  // reduced-motion block, say) is never asked.
  const walk = (node: Node, around: string[]) => {
    for (const child of node.nodes) {
      const h = child.header;
      if (h.startsWith("@layer") || h.startsWith("@media")) {
        walk(child, [...around, h]);
        continue;
      }
      if (h.startsWith("@")) continue;
      if (!selectors(h).some((s) => targets.includes(s))) continue;
      const answers = around.map((a) => holds(a, at));
      if (answers.includes(false)) continue;
      inside(child, answers.includes("layer"));
    }
  };
  walk(parse(css), []);
  return Object.fromEntries([...won].map(([k, v]) => [k, v.value]));
}

/**
 * A compiled length, in px, at a window: `min()`, `max()`, `calc()` and
 * `var()` over px, rem, vw, vh and dvh, with custom properties as the element
 * inherits them.
 */
export function lengthAt(
  value: string,
  at: { width: number; height: number; vars?: Record<string, string> },
): number {
  let expr = value;
  // Innermost `var()` first, so a fallback that is itself a `var()` resolves.
  const VAR = /var\((--[\w-]+)(?:,\s*([^()]*))?\)/;
  for (let m = VAR.exec(expr); m; m = VAR.exec(expr)) {
    const v = at.vars?.[m[1]] ?? m[2];
    if (v === undefined) throw new Error(`lengthAt: ${m[1]} is not set`);
    expr = expr.replace(m[0], v);
  }
  const unit: Record<string, number> = {
    px: 1,
    rem: 16,
    vw: at.width / 100,
    vh: at.height / 100,
    dvh: at.height / 100,
  };
  const inPx = expr
    .replace(/([\d.]+)(px|rem|vw|dvh|vh)/g, (_, n, u) => `${Number(n) * unit[u]}`)
    .replace(/\s+/g, "");
  const tokens = inPx.match(/min|max|calc|[\d.]+|[-+*/(),]/g);
  // Anything not read above - an unknown unit or function - is refused
  // rather than skipped.
  if (!tokens || tokens.join("") !== inPx)
    throw new Error(`lengthAt: cannot read ${value}`);
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];
  const args = (): number[] => {
    next(); // (
    const out = [sum()];
    while (peek() === ",") {
      next();
      out.push(sum());
    }
    next(); // )
    return out;
  };
  const atom = (): number => {
    const t = next();
    if (t === "min") return Math.min(...args());
    if (t === "max") return Math.max(...args());
    if (t === "calc") return args()[0];
    if (t === "(") {
      const v = sum();
      next();
      return v;
    }
    if (t === "-") return -atom();
    return Number(t);
  };
  const product = (): number => {
    let v = atom();
    while (peek() === "*" || peek() === "/") v = next() === "*" ? v * atom() : v / atom();
    return v;
  };
  const sum = (): number => {
    let v = product();
    while (peek() === "+" || peek() === "-") v = next() === "+" ? v + product() : v - product();
    return v;
  };
  return sum();
}

/** The order the compiled stylesheet writes these rule selectors in. */
export function ruleOrder(css: string, targets: string[]): string[] {
  const found: string[] = [];
  const walk = (node: Node) => {
    for (const child of node.nodes) {
      if (targets.includes(child.header)) found.push(child.header);
      else walk(child);
    }
  };
  walk(parse(css));
  return found;
}
