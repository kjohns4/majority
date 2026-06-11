// ─────────────────────────────────────────────────────────────────────────────
// /api/preview?trackId=<deezer id>  — Vercel Serverless Function
//
// WHAT: Returns a FRESH 30-second preview URL for one Deezer track.
//
// WHY:  Deezer preview URLs are signed and expire after ~15 minutes (the
//       `hdnea=exp=...` token). So the URL we stored at seed time goes stale and
//       starts returning 403. Playback must therefore resolve a fresh URL right
//       before playing — and the browser can't call api.deezer.com directly
//       (it doesn't send an Access-Control-Allow-Origin). This tiny proxy does
//       the fetch server-side, where CORS doesn't apply, and hands back just the
//       current preview URL.
//
// HOW:  GET the track from Deezer (public, no key) and return { preview }. We let
//       the response be cached for 10 minutes — comfortably under the ~15-minute
//       token lifetime — to avoid re-hitting Deezer for every play.
//
// RUNTIME: Node serverless (Vercel's recommended default). The handler uses the
//          Node `(req, res)` signature — `res.status().json()` actually ends the
//          response. (A web-standard `(request) => Response` handler would be
//          ignored here and hang.)
// ─────────────────────────────────────────────────────────────────────────────

import type { IncomingMessage, ServerResponse } from 'node:http'

// Vercel's Node runtime augments the request with a parsed `query` object.
type VercelRequest = IncomingMessage & { query: Record<string, string | string[]> }
type VercelResponse = ServerResponse & {
  status(code: number): VercelResponse
  json(body: unknown): void
}

function send(
  res: VercelResponse,
  body: unknown,
  status = 200,
  cacheSeconds = 0,
): void {
  if (cacheSeconds > 0) {
    res.setHeader('Cache-Control', `public, max-age=${cacheSeconds}`)
  }
  res.status(status).json(body)
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  const raw = req.query.trackId
  const trackId = Array.isArray(raw) ? raw[0] : raw
  // trackId is a Deezer numeric id; reject anything else before calling out.
  if (!trackId || !/^\d+$/.test(trackId)) {
    return send(res, { error: 'Missing or invalid trackId' }, 400)
  }

  try {
    const upstream = await fetch(`https://api.deezer.com/track/${trackId}`)
    if (!upstream.ok) {
      return send(res, { error: `Deezer track request failed (${upstream.status})` }, 502)
    }
    const data = (await upstream.json()) as { preview?: string | null }
    // 10-minute cache: a fresh token is valid ~15 min, so callers always get a
    // URL with several minutes of life left.
    return send(res, { preview: data.preview ?? null }, 200, 600)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return send(res, { error: message }, 502)
  }
}
