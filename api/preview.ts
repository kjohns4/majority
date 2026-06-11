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
// ─────────────────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200, cacheSeconds = 0): Response {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (cacheSeconds > 0) {
    headers['cache-control'] = `public, max-age=${cacheSeconds}`
  }
  return new Response(JSON.stringify(body), { status, headers })
}

export default async function handler(request: Request): Promise<Response> {
  const trackId = new URL(request.url).searchParams.get('trackId')
  // trackId is a Deezer numeric id; reject anything else before calling out.
  if (!trackId || !/^\d+$/.test(trackId)) {
    return json({ error: 'Missing or invalid trackId' }, 400)
  }

  try {
    const res = await fetch(`https://api.deezer.com/track/${trackId}`)
    if (!res.ok) {
      return json({ error: `Deezer track request failed (${res.status})` }, 502)
    }
    const data = (await res.json()) as { preview?: string | null }
    // 10-minute cache: a fresh token is valid ~15 min, so callers always get a
    // URL with several minutes of life left.
    return json({ preview: data.preview ?? null }, 200, 600)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return json({ error: message }, 502)
  }
}
