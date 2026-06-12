import type { IncomingMessage, ServerResponse } from 'node:http'

// ─────────────────────────────────────────────────────────────────────────────
// /api/preview?trackId=<deezer id>  — Vercel Serverless Function (Node runtime)
//
// WHAT: Returns a FRESH 30-second preview URL for one Deezer track.
//
// WHY:  Deezer preview URLs are signed and expire after ~15 minutes (the
//       `hdnea=exp=...` token), so the URL stored at seed time goes stale (403).
//       Playback resolves a fresh URL right before playing — and the browser
//       can't call api.deezer.com directly (no Access-Control-Allow-Origin), so
//       this proxy does the fetch server-side.
//
// HOW:  Parse trackId from the URL, GET the track from Deezer (public, no key),
//       return { preview }. Cached 10 min — under the ~15 min token lifetime — so
//       we don't re-hit Deezer for every play.
//
// NOTE: Vercel's Node runtime calls functions with (req, res) — req.url is a
//       path like "/api/preview?trackId=123", not an absolute URL — so we parse
//       the query off the path rather than constructing a URL.
// ─────────────────────────────────────────────────────────────────────────────

function sendJson(
  res: ServerResponse,
  body: unknown,
  status = 200,
  cacheSeconds = 0,
): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  if (cacheSeconds > 0) {
    res.setHeader('cache-control', `public, max-age=${cacheSeconds}`)
  }
  res.end(JSON.stringify(body))
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const query = req.url?.includes('?') ? req.url.slice(req.url.indexOf('?') + 1) : ''
  const trackId = new URLSearchParams(query).get('trackId')

  // trackId is a Deezer numeric id; reject anything else before calling out.
  if (!trackId || !/^\d+$/.test(trackId)) {
    sendJson(res, { error: 'Missing or invalid trackId' }, 400)
    return
  }

  try {
    const deezer = await fetch(`https://api.deezer.com/track/${trackId}`)
    if (!deezer.ok) {
      sendJson(res, { error: `Deezer track request failed (${deezer.status})` }, 502)
      return
    }
    const data = (await deezer.json()) as { preview?: string | null }
    // 10-minute cache: a fresh token is valid ~15 min, so callers always get a
    // URL with several minutes of life left.
    sendJson(res, { preview: data.preview ?? null }, 200, 600)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    sendJson(res, { error: message }, 502)
  }
}
