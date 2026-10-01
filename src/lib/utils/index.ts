import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge class names with Tailwind-aware conflict resolution (shadcn). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * A UUID-shaped random id that also works in non-secure contexts.
 * `crypto.randomUUID()` is only defined over HTTPS or on `localhost`, so on a
 * plain-HTTP LAN address (e.g. a phone hitting the dev server by IP) it is
 * `undefined` — fall back to `getRandomValues` (available everywhere), then to a
 * last-resort string.
 */
export function randomId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  if (c?.getRandomValues) {
    const b = c.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant
    const h = Array.from(b, (x) => x.toString(16).padStart(2, "0"));
    return `${h.slice(0, 4).join("")}-${h.slice(4, 6).join("")}-${h.slice(6, 8).join("")}-${h.slice(8, 10).join("")}-${h.slice(10, 16).join("")}`;
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
}

export { sanitizeForDisplay, containsClinicalTerm } from "./zeroTag";
export { formatProfile } from "./formatProfile";
export { formatTimeEstimate } from "./formatTime";
export {
  lessonModules,
  modulePositionFor,
  positionLine,
  opensLaterModule,
  moduleName,
  type ModulePosition,
} from "./modules";
