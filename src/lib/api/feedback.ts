import { api } from "./client";

/**
 * Product feedback from inside the console.
 *
 * The request is typed - `type`, `note`, and an optional `context` - while the
 * 201 is a free-form string map, one of the seven endpoints still returning an
 * untyped ack. Nothing here reads the response body: a 201 means it was
 * stored, which is the whole contract this screen needs.
 *
 * `type` has no enum. `GET /api/v1/ops/feedback`, the read side, carries the
 * same field as a bare string, so the two values the teacher panel sends are
 * ours to define and should stay stable for whoever triages them.
 *
 * `context` is where the teacher was standing when they wrote it. Ops asking
 * "which screen was this about" is the first question feedback raises, and the
 * route answers it for free.
 */

/**
 * `account_request` is the third, added 16 Sep for D14's "Request another
 * account". The admin Team screen drew that as a primary button with no
 * handler at all - styled navy, promising "we'll add it at no charge, just
 * ask", and doing nothing when asked. There is no bespoke endpoint for an
 * extra admin seat and there does not need to be: this route is deployed,
 * carries `context`, and lands where somebody triages it.
 *
 * `plan_change` is the fourth (8 Oct): D11d's switch between the annual and
 * per-term plans, which backend confirms "through the relationship manager" -
 * so, like the extra seat, it is a sentence to a person, not a mutation.
 */
export type FeedbackType = "feedback" | "feature" | "account_request" | "plan_change";

export const feedbackApi = {
  submit: (payload: { type: FeedbackType; note: string; context?: string }) =>
    api.post<Record<string, string>>("/api/v1/feedback", payload),
};
