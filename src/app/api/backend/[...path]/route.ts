/**
 * Same-origin catch-all proxy to the FastAPI backend.
 *
 * The backend exposes no CORS headers (browser preflights 405), so every
 * browser-side call goes through here: `/api/backend/<path>` forwards to
 * `<UPSTREAM>/<path>` with the method, raw body and Authorization header
 * intact - raw so that multipart file uploads survive the hop byte for byte. Auth is Bearer-token (no cookies), so nothing else needs rewriting.
 * Remove in favour of direct calls if/when the backend grows CORSMiddleware.
 */
import type { NextRequest } from "next/server";
import { API_ORIGIN } from "@/lib/api/upstream";

// See `lib/api/upstream` - the backend moved, and this used to hard-code the old host.
const UPSTREAM = API_ORIGIN;

/**
 * Upstream routes declared with a trailing slash. FastAPI answers the
 * slashless form with a 307 to the canonical one; `fetch` follows it, so calls
 * work either way - at the cost of an extra upstream round trip on a
 * cold-start-prone host. Next normalises the trailing slash out of the request
 * before this handler runs (`trailingSlash: false`), so the client cannot
 * express the intent and the canonical form has to be restored here.
 */
const SLASH_REQUIRED = new Set(["api/v1/ask-nevo", "api/signals"]);

/**
 * How long to wait before giving up, in ms.
 *
 * READING A ROW AND GENERATING A LESSON ARE NOT THE SAME REQUEST. The 60s
 * below was chosen for the worst case of a *read* - Render's free tier
 * cold-starting - and then applied to everything, including the routes where
 * the backend runs a model. Regenerating the one lesson in the library runs
 * past 60s, so this proxy hung up on it every time and the client was handed a
 * 502; the backend was never the thing that failed.
 *
 * So the routes that do work upstream get a budget that fits the work. Nothing
 * here waits forever - a request that has not answered in four minutes has
 * failed, it is just allowed to fail for a real reason.
 */
const DEFAULT_TIMEOUT_MS = 60_000;
const LONG_RUNNING_TIMEOUT_MS = 240_000;

/**
 * Parsing a document, ingesting an upload, generating a lesson - and every
 * route where the backend runs a MODEL.
 *
 * The first version of this list was drawn from the one route being debugged
 * at the time (`regenerate`, which no client method even calls yet) and missed
 * the five model-backed routes the app calls in normal use. Ask Nevo is the
 * one that matters most: a child asks a question, the answer is generated, and
 * a cold start on top of generation is exactly the case the read budget cuts
 * off. If you add an upstream route that GENERATES rather than reads, add it
 * here.
 */
const LONG_RUNNING: RegExp[] = [
  // Content ingestion. NOTE what is NOT here any more: `api/content/parse`,
  // `api/content/upload` and `api/content/lessons/{id}/regenerate` all answer
  // 202 in well under a second now and do the work behind a poll, so giving
  // them four minutes would only mean waiting four minutes to find out a
  // socket had died. They were the reason this list was written.
  /^api\/v1\/uploads$/,
  /^api\/v1\/uploads\/batch$/,
  /^api\/v1\/uploads\/[^/]+\/retry-pages$/,
  // Model-backed reads and writes.
  /^api\/v1\/ask-nevo\/?$/,
  /^api\/intelligence\/adapt$/,
  /^api\/v1\/exports\/iep$/,
  /^api\/v1\/school\/narrative$/,
  /^api\/admin\/compliance-audit\/scan$/,
];

function timeoutFor(joined: string): number {
  return LONG_RUNNING.some((route) => route.test(joined))
    ? LONG_RUNNING_TIMEOUT_MS
    : DEFAULT_TIMEOUT_MS;
}

function upstreamPath(joined: string): string {
  return SLASH_REQUIRED.has(joined) ? `${joined}/` : joined;
}

async function forward(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await params;
  const joined = path.join("/");
  const url = new URL(`${UPSTREAM}/${upstreamPath(joined)}`);
  request.nextUrl.searchParams.forEach((value, key) =>
    url.searchParams.set(key, value),
  );

  const headers: Record<string, string> = {};
  const auth = request.headers.get("authorization");
  if (auth) headers.Authorization = auth;
  const contentType = request.headers.get("content-type");
  if (contentType) headers["Content-Type"] = contentType;

  // Bytes, not text: a multipart upload carries a binary PDF or DOCX, and
  // decoding it as UTF-8 to re-encode it would corrupt the file. JSON bodies
  // pass through an ArrayBuffer unchanged, so this is right for both.
  const raw =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.arrayBuffer();

  const budget = timeoutFor(joined);

  try {
    const upstream = await fetch(url, {
      method: request.method,
      headers,
      body: raw && raw.byteLength > 0 ? raw : undefined,
      signal: AbortSignal.timeout(budget),
    });
    if (upstream.status === 204) return new Response(null, { status: 204 });
    /*
     * BYTES, NOT TEXT - and the comment above the request body already said so.
     *
     * The REQUEST direction was fixed to use an ArrayBuffer precisely because
     * "decoding it as UTF-8 to re-encode it would corrupt the file". The
     * RESPONSE direction went on doing exactly that, so every binary this
     * proxy carried came out the other side mangled: the NDPA compliance PDF
     * and every billing invoice PDF, both of which fetch through here because
     * `/api/backend` is the default base URL.
     *
     * A JSON body survives an ArrayBuffer round trip unchanged, so this is
     * right for both, the same way it is on the way in.
     */
    const payload = await upstream.arrayBuffer();
    return new Response(payload, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    // A TIMEOUT IS NOT UNREACHABILITY, and collapsing the two cost real time:
    // three attempts at regenerating a lesson read as the backend being down,
    // when what actually happened was this handler hanging up on a request
    // that was still running. `AbortSignal.timeout` rejects with a
    // `TimeoutError`; checking the name rather than the class keeps this true
    // whichever runtime it runs on.
    const timedOut = (error as Error | undefined)?.name === "TimeoutError";
    return Response.json(
      {
        detail: timedOut
          ? `The backend did not answer within ${budget / 1000}s.`
          : "The backend is unreachable right now.",
      },
      // 504, not 502: we reached it, it was still working, we stopped waiting.
      { status: timedOut ? 504 : 502 },
    );
  }
}

export {
  forward as GET,
  forward as POST,
  forward as PUT,
  forward as PATCH,
  forward as DELETE,
};
