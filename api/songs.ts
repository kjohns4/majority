import { createClient } from '@supabase/supabase-js'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { SongRow } from '../src/types/index.ts'

// ─────────────────────────────────────────────────────────────────────────────
// /api/songs  — Vercel Serverless Function (Node runtime, web-standard handler)
//
// WHAT: Fetches a batch of fresh songs from Deezer (each with a real 30-second
//       preview), upserts them into the Supabase `songs` table, and returns the
//       saved rows (each with its Supabase UUID).
//
// WHY:  Two things: (1) Deezer's public API needs no key, so there's no secret to
//       protect on the catalog side — but (2) the `songs` table is read-only for
//       anonymous users (RLS), so seeding it still requires the Supabase
//       service-role key, which must stay server side. This function is where
//       that privileged write happens, off the client.
//
//       (We originally used Spotify here, but Spotify's Web API now requires the
//       app owner to hold a Premium subscription — every endpoint 403s without
//       it. Deezer has no such gate and reliably returns previews, so it's the
//       catalog source.)
//
// HOW:  editorial/0/releases gives genuinely new-release albums → fetch each
//       album's tracks (batched, to respect Deezer's rate limit) and take the
//       first track that has a preview → top up from chart/0/tracks if we came up
//       short → Supabase upsert (onConflict spotify_id, so re-running is
//       idempotent; the column just holds the external Deezer track id now).
//
// RUNTIME: Node serverless (Vercel's recommended default). Uses the Node
//          `(req, res)` signature so `res.status().json()` actually ends the
//          response. (A web-standard `(request) => Response` handler would be
//          ignored here and the function would hang until it times out.)
// ─────────────────────────────────────────────────────────────────────────────

const DEEZER = 'https://api.deezer.com'
const TARGET_COUNT = 50
const ALBUM_BATCH = 8 // concurrent album fetches; keeps us under Deezer's limit

/** A song we are about to upsert (no id/created_at yet — Supabase fills those). */
type NewSong = Omit<SongRow, 'id' | 'created_at'>

interface DeezerArtist {
  name: string
}
interface DeezerAlbum {
  id: number
  cover_xl: string | null
  cover_big: string | null
}
interface DeezerTrack {
  id: number
  title: string
  title_short?: string
  preview: string | null
  artist: DeezerArtist
  album?: DeezerAlbum
}
interface DeezerReleaseAlbum {
  id: number
  cover_xl: string | null
  cover_big: string | null
  artist: DeezerArtist
}

// Vercel's Node runtime augments these with helpers; type just what we use.
type VercelRequest = IncomingMessage
type VercelResponse = ServerResponse & {
  status(code: number): VercelResponse
  json(body: unknown): void
}

function send(res: VercelResponse, body: unknown, status = 200): void {
  res.status(status).json(body)
}

async function deezerGet<T>(path: string): Promise<T> {
  const res = await fetch(`${DEEZER}${path}`)
  if (!res.ok) throw new Error(`Deezer GET ${path} failed (${res.status})`)
  return (await res.json()) as T
}

/** Shapes a Deezer track + its album art into our song row. */
function toSong(track: DeezerTrack, albumArt: string | null): NewSong {
  return {
    spotify_id: String(track.id), // external unique id (Deezer track id)
    title: track.title_short || track.title,
    artist: track.artist.name,
    album_art_url: albumArt ?? track.album?.cover_xl ?? track.album?.cover_big ?? '',
    preview_url: track.preview ?? null,
  }
}

/** Runs async `fn` over `items` in fixed-size concurrent batches. */
async function inBatches<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size)
    out.push(...(await Promise.all(batch.map(fn))))
  }
  return out
}

/** New releases: one previewable track per fresh album. */
async function fromNewReleases(): Promise<NewSong[]> {
  const releases = await deezerGet<{ data: DeezerReleaseAlbum[] }>(
    `/editorial/0/releases?limit=${TARGET_COUNT}`,
  )

  const perAlbum = await inBatches(releases.data, ALBUM_BATCH, async (album) => {
    try {
      const tracks = await deezerGet<{ data: DeezerTrack[] }>(
        `/album/${album.id}/tracks?limit=10`,
      )
      const track = tracks.data.find((t) => t.preview)
      if (!track) return null
      return toSong(track, album.cover_xl ?? album.cover_big)
    } catch {
      return null // skip a flaky album rather than failing the whole seed
    }
  })

  return perAlbum.filter((s): s is NewSong => s !== null)
}

/** Top-up: chart tracks already carry preview + album art inline (one call). */
async function fromCharts(): Promise<NewSong[]> {
  const chart = await deezerGet<{ data: DeezerTrack[] }>(
    `/chart/0/tracks?limit=${TARGET_COUNT}`,
  )
  return chart.data
    .filter((t) => t.preview)
    .map((t) => toSong(t, t.album?.cover_xl ?? t.album?.cover_big ?? null))
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return send(res, { error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    const missing = [
      !supabaseUrl && 'SUPABASE_URL',
      !serviceRoleKey && 'SUPABASE_SERVICE_ROLE_KEY',
    ].filter(Boolean)
    return send(res, { error: `Server is missing env vars: ${missing.join(', ')}` }, 500)
  }

  try {
    // Primary: fresh releases. Top up from charts if we came up short.
    const songs = await fromNewReleases()
    if (songs.length < TARGET_COUNT) {
      const extra = await fromCharts()
      const seen = new Set(songs.map((s) => s.spotify_id))
      for (const s of extra) {
        if (songs.length >= TARGET_COUNT) break
        if (!seen.has(s.spotify_id)) {
          seen.add(s.spotify_id)
          songs.push(s)
        }
      }
    }

    if (songs.length === 0) {
      return send(res, { error: 'No songs with previews found upstream.' }, 502)
    }

    // Upsert (service role bypasses the read-only RLS on songs). onConflict
    // spotify_id makes repeat runs idempotent instead of duplicating rows.
    const admin = createClient(supabaseUrl, serviceRoleKey)
    const { data, error } = await admin
      .from('songs')
      .upsert(songs, { onConflict: 'spotify_id' })
      .select()

    if (error) {
      return send(res, { error: `Supabase upsert failed: ${error.message}` }, 500)
    }

    return send(res, { songs: data as SongRow[] })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return send(res, { error: message }, 502)
  }
}
