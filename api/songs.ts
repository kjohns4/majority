import { createClient } from '@supabase/supabase-js'
import type { SongRow } from '../src/types/index.ts'

// ─────────────────────────────────────────────────────────────────────────────
// /api/songs  — Vercel Serverless Function (Node runtime, web-standard handler)
//
// WHAT: Fetches a batch of emerging songs from Spotify, fills in any missing
//       30-second previews from Deezer, upserts them into the Supabase `songs`
//       table, and returns the saved rows (each with its Supabase UUID).
//
// WHY:  Two things MUST happen on the server, never in the browser:
//         1. The Spotify Client Secret is used to mint an API token. Shipping it
//            to the client would leak it to anyone who opens DevTools.
//         2. The `songs` table is read-only for anonymous users (RLS). Seeding it
//            requires the Supabase service-role key, which also must stay server
//            side. Doing both here keeps every secret off the client while still
//            giving the frontend real song rows (with UUIDs) to vote against.
//
// HOW:  Spotify "client credentials" flow → /browse/new-releases for fresh
//       albums → /albums?ids batch to pull each album's first track (which
//       carries preview_url) → Deezer search to backfill missing previews →
//       Supabase upsert (onConflict spotify_id, so re-running is idempotent).
// ─────────────────────────────────────────────────────────────────────────────

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token'
const SPOTIFY_API = 'https://api.spotify.com/v1'
const DEEZER_SEARCH = 'https://api.deezer.com/search'

interface SpotifyImage {
  url: string
  width: number | null
  height: number | null
}

interface SpotifyTrack {
  id: string
  name: string
  preview_url: string | null
  artists: { name: string }[]
}

interface SpotifyAlbum {
  id: string
  name: string
  images: SpotifyImage[]
  artists: { name: string }[]
  tracks: { items: SpotifyTrack[] }
}

/** A song we are about to upsert (no id/created_at yet — Supabase fills those). */
type NewSong = Omit<SongRow, 'id' | 'created_at'>

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** Step 1: exchange client id + secret for a short-lived Spotify access token. */
async function getSpotifyToken(clientId: string, clientSecret: string): Promise<string> {
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) {
    throw new Error(`Spotify token request failed (${res.status})`)
  }
  const data = (await res.json()) as { access_token: string }
  return data.access_token
}

/** Helper for authenticated GETs against the Spotify Web API. */
async function spotifyGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${SPOTIFY_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    throw new Error(`Spotify GET ${path} failed (${res.status})`)
  }
  return (await res.json()) as T
}

/** Splits an array into chunks of `size` (Spotify caps /albums at 20 ids). */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}

/**
 * Best-effort: ask Deezer (public, no auth) for a 30s preview of a track that
 * Spotify didn't give us one for. Returns null on any failure so the caller can
 * fall back gracefully.
 */
async function deezerPreview(title: string, artist: string): Promise<string | null> {
  try {
    const q = encodeURIComponent(`track:"${title}" artist:"${artist}"`)
    const res = await fetch(`${DEEZER_SEARCH}?q=${q}&limit=1`)
    if (!res.ok) return null
    const data = (await res.json()) as { data?: { preview?: string }[] }
    return data.data?.[0]?.preview ?? null
  } catch {
    return null
  }
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const spotifyClientId = process.env.SPOTIFY_CLIENT_ID
  const spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  // Fail with a clear, actionable message rather than a vague 500.
  const missing: string[] = []
  if (!spotifyClientId) missing.push('SPOTIFY_CLIENT_ID')
  if (!spotifyClientSecret) missing.push('SPOTIFY_CLIENT_SECRET')
  if (!supabaseUrl) missing.push('SUPABASE_URL')
  if (!serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (missing.length > 0) {
    return json(
      { error: `Server is missing env vars: ${missing.join(', ')}` },
      500,
    )
  }

  try {
    // 1. Token, then a page of fresh albums.
    const token = await getSpotifyToken(spotifyClientId!, spotifyClientSecret!)
    const newReleases = await spotifyGet<{ albums: { items: { id: string }[] } }>(
      '/browse/new-releases?limit=50',
      token,
    )
    const albumIds = newReleases.albums.items.map((a) => a.id)

    // 2. Hydrate albums in batches of 20 to get their tracks (with preview_url).
    const albums: SpotifyAlbum[] = []
    for (const batch of chunk(albumIds, 20)) {
      const res = await spotifyGet<{ albums: SpotifyAlbum[] }>(
        `/albums?ids=${batch.join(',')}`,
        token,
      )
      albums.push(...res.albums.filter(Boolean))
    }

    // 3. Take the lead track of each album and shape it into a song row.
    const songs: NewSong[] = []
    for (const album of albums) {
      const track = album.tracks.items[0]
      if (!track) continue
      const artist = track.artists[0]?.name ?? album.artists[0]?.name ?? 'Unknown'
      let preview = track.preview_url
      // Spotify has been returning null previews for many tracks since late 2024;
      // backfill from Deezer so the core "play a 30s clip" loop still works.
      if (!preview) {
        preview = await deezerPreview(track.name, artist)
      }
      songs.push({
        spotify_id: track.id,
        title: track.name,
        artist,
        album_art_url: album.images[0]?.url ?? '',
        preview_url: preview,
      })
    }

    // 4. Upsert into Supabase (service role bypasses the read-only RLS on songs).
    //    onConflict spotify_id makes repeat runs idempotent instead of duplicating.
    const admin = createClient(supabaseUrl!, serviceRoleKey!)
    const { data, error } = await admin
      .from('songs')
      .upsert(songs, { onConflict: 'spotify_id' })
      .select()

    if (error) {
      return json({ error: `Supabase upsert failed: ${error.message}` }, 500)
    }

    return json({ songs: data as SongRow[] })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return json({ error: message }, 502)
  }
}
