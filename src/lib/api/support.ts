import { api } from "./client";

/**
 * How to reach a person at Nevo.
 *
 * Design ruled this is ONE SCREEN, not a knowledge base: support email,
 * WhatsApp number, response time. Until 17 Sep two of those three existed
 * nowhere in the product, so the nav item closed the menu and did nothing -
 * the one route out of the console when something has gone wrong.
 *
 * WE DID NOT BORROW A RESPONSE TIME, and neither did backend. The landing
 * page's "within 24 hours" is a sales promise to a prospect and the 48-hour one
 * is an NDPA data-rights obligation; neither is a support commitment. This
 * string is the commitment Nevo has actually made, and the DAYS are part of it:
 * a Friday-evening message answered Monday keeps "Mon-Fri, within 24 hours" and
 * breaks a bare "within 24 hours".
 *
 * PUBLIC, DELIBERATELY. No `security` on the operation, because a teacher who
 * cannot sign in is exactly who needs it - which is why `/teacher/help` is on
 * the pre-auth allowlist in `proxy.ts`.
 */
export interface WhatsAppContact {
  /** Display form, spaced for reading aloud. */
  number: string;
  /**
   * DERIVED BY BACKEND, never assembled here. `wa.me` takes digits only and
   * fails SILENTLY on a plus or a space - it renders as a dead link rather
   * than a malformed one, which is the worst way for this to break.
   */
  link: string;
}

export interface SupportContact {
  email: string;
  whatsapp: WhatsAppContact;
  /** Nullable in the contract: a school may publish no promise at all. */
  responseTime: string | null;
}

export const supportApi = {
  contact: () => api.get<SupportContact>("/api/v1/support-contact"),
};
