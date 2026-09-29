/**
 * Same-origin proxy for the public partner-inquiry endpoint (SCRUM-43/82).
 *
 * The landing form posts here; this forwards server-side to the backend's
 * `POST /api/v1/partner-inquiries`. Proxying keeps the browser call
 * same-origin - the backend currently exposes no CORS headers, and a public
 * marketing form shouldn't depend on them anyway.
 */
import { API_ORIGIN } from "@/lib/api/upstream";

// See `lib/api/upstream` - the backend moved, and this used to hard-code the old host.
const UPSTREAM = API_ORIGIN;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ detail: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${UPSTREAM}/api/v1/partner-inquiries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // The Render dyno can cold-start; give it room rather than failing the lead.
      signal: AbortSignal.timeout(60_000),
    });
    const payload = await upstream.json().catch(() => null);
    return Response.json(payload, { status: upstream.status });
  } catch {
    return Response.json(
      { detail: "The inquiry service is unreachable right now." },
      { status: 502 },
    );
  }
}
