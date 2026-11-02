import type { APIResponse } from "@playwright/test";

/**
 * What a server failure said, for a test's failure message - and nothing for
 * anything below 500.
 *
 * A 5xx is the server's fault, not the test's credentials, and backend can only
 * trace one from what came back. An application 500 carries `detail.incidentId`;
 * one from the hosting in front of the app may carry none, so its body is shown
 * instead. Teslim asked for this on 30 Oct, after the 28 Oct sign-in failures
 * left nothing to trace: the tests had logged only the status.
 *
 * Only 5xx bodies are shown. A 4xx validation error can echo back the email and
 * password that were sent.
 */
export async function serverFailure(res: APIResponse): Promise<string> {
  if (res.status() < 500) return "";
  const text = await res.text().catch(() => "");
  let incident: unknown;
  try {
    incident = (JSON.parse(text) as { detail?: { incidentId?: unknown } }).detail?.incidentId;
  } catch {
    // Not JSON (most likely the hosting's own error page), or JSON with no detail.
  }
  return typeof incident === "string" && incident
    ? ` The server failed with incident ${incident}: send backend that id.`
    : ` The server failed with no incident id, so it may never have reached the app. It sent: ${text.slice(0, 300) || "(an empty body)"}`;
}
