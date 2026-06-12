import { supabase } from './supabase'
import { songFromRow, type Song, type SongRow } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// Catalog (frontend side)
//
// WHAT: `fetchEmergingSongs()` returns the list of songs to swipe through.
//
// WHY:  The browser never seeds the catalog — writing to the read-only `songs`
//       table needs the service-role key, which must stay server side. Seeding is
//       a separate concern (the /api/songs function, run on a schedule). The
//       client just READS, which keeps Discover instant: a single fast Supabase
//       query, with no dependency on the slower seeding function at page load.
//
//       Rotation (Option D): we never delete songs — the table keeps full
//       history so the leaderboard stays intact. Discover just *reads a window*:
//       only songs first seen in the last 7 days are swipeable. So the catalog
//       rotates without ever destroying vote history.
// ─────────────────────────────────────────────────────────────────────────────

/** How far back Discover looks. Older songs stay in the DB but aren't swiped. */
const DISCOVER_WINDOW_DAYS = 7

function discoverCutoffIso(): string {
  return new Date(
    Date.now() - DISCOVER_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()
}

/** Reads recently-seeded songs straight from Supabase (anon, read-only). */
async function readSeededSongs(): Promise<Song[]> {
  const { data, error } = await supabase
    .from('songs')
    .select('*')
    .gte('created_at', discoverCutoffIso())
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    throw new Error(`Could not read songs from Supabase: ${error.message}`)
  }
  return (data as SongRow[]).map(songFromRow)
}

// ── Fresh preview URLs ──────────────────────────────────────────────────────
// Deezer preview URLs are signed and expire after ~15 minutes, so the one stored
// at seed time can't be trusted for playback. `resolvePreview` fetches a current
// URL for a track right before it's played.

interface DeezerTrackResponse {
  preview?: string | null
}

/**
 * Browser-side fallback for plain `vite dev` (no serverless function). The
 * Deezer API doesn't send CORS headers, so a normal fetch() is blocked — but it
 * supports JSONP, which loads via a <script> tag and sidesteps CORS entirely.
 */
function deezerJsonp(trackId: string): Promise<string | null> {
  return new Promise((resolve) => {
    const cbName = `__dzcb_${Math.random().toString(36).slice(2)}`
    const globals = window as unknown as Record<
      string,
      ((data: DeezerTrackResponse) => void) | undefined
    >
    const script = document.createElement('script')

    const cleanup = () => {
      clearTimeout(timer)
      delete globals[cbName]
      script.remove()
    }
    const timer = setTimeout(() => {
      cleanup()
      resolve(null)
    }, 8000)

    globals[cbName] = (data) => {
      const preview = data?.preview ?? null
      cleanup()
      resolve(preview)
    }
    script.onerror = () => {
      cleanup()
      resolve(null)
    }
    script.src = `https://api.deezer.com/track/${encodeURIComponent(
      trackId,
    )}?output=jsonp&callback=${cbName}`
    document.body.appendChild(script)
  })
}

/**
 * Returns a currently-valid 30s preview URL for a Deezer track id, or null if
 * none is available. Prefers our /api/preview proxy (clean, works in prod), and
 * falls back to Deezer JSONP when the function isn't running locally.
 */
export async function resolvePreview(trackId: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/preview?trackId=${encodeURIComponent(trackId)}`)
    const contentType = res.headers.get('content-type') ?? ''
    if (res.ok && contentType.includes('application/json')) {
      const body = (await res.json()) as { preview?: string | null }
      // Proxy is authoritative when it answers with JSON (even a null preview).
      return body.preview ?? null
    }
  } catch {
    // Fall through to the JSONP fallback.
  }
  return deezerJsonp(trackId)
}

/**
 * Returns the songs to swipe through: a fast, windowed read from Supabase. The
 * catalog is populated separately by the /api/songs seeding function, so this
 * stays instant and never blocks on a Deezer round-trip.
 */
export async function fetchEmergingSongs(): Promise<Song[]> {
  return readSeededSongs()
}
