import type { IncomingMessage, ServerResponse } from 'node:http'
import { createClient } from '@supabase/supabase-js'
import type { SongRow } from '../src/types/index.ts'

// ─────────────────────────────────────────────────────────────────────────────
// /api/songs  — Vercel Serverless Function (Node runtime)
//
// WHAT: Fetches a batch of fresh songs from Deezer (each with a real 30-second
//       preview) and upserts them into the Supabase `songs` table. This is the
//       SEEDING endpoint — it's meant to be run periodically (e.g. a daily cron),
//       not on every page load. The client reads songs straight from Supabase.
//
// WHY:  Deezer's public API needs no key, but the `songs` table is read-only for
//       anonymous users (RLS), so seeding requires the Supabase service-role key,
//       which must stay server side. That privileged write happens here.
//
//       (Spotify's Web API now requires the app owner to hold Premium — every
//       endpoint 403s without it — so Deezer is the catalog source.)
//
// HOW:  editorial/0/releases → fetch each album's tracks (batched) → take the
//       first previewable track → top up from chart/0/tracks → Supabase upsert
//       (onConflict spotify_id, idempotent; the column holds the Deezer track id).
//
// NOTE: Vercel's Node runtime calls functions with (req, res) — NOT the web
//       Request/Response signature. We write JSON via res, not by returning.
// ─────────────────────────────────────────────────────────────────────────────

export const config = { maxDuration: 60 }

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

function sendJson(res: ServerResponse, body: unknown, status = 200): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
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
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const method = req.method ?? 'GET'
  if (method !== 'GET' && method !== 'POST') {
    sendJson(res, { error: 'Method not allowed' }, 405)
    return
  }

  // Seeding does privileged writes, so don't let just anyone trigger it. When
  // CRON_SECRET is set, Vercel's cron sends `Authorization: Bearer <secret>`;
  // require it. (If the secret isn't set — e.g. local dev — the check is skipped.)
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers['authorization'] !== `Bearer ${cronSecret}`) {
    sendJson(res, { error: 'Unauthorized' }, 401)
    return
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    const missing = [
      !supabaseUrl && 'SUPABASE_URL',
      !serviceRoleKey && 'SUPABASE_SERVICE_ROLE_KEY',
    ].filter(Boolean)
    sendJson(res, { error: `Server is missing env vars: ${missing.join(', ')}` }, 500)
    return
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
      sendJson(res, { error: 'No songs with previews found upstream.' }, 502)
      return
    }

    // Upsert (service role bypasses the read-only RLS on songs). onConflict
    // spotify_id makes repeat runs idempotent instead of duplicating rows.
    const admin = createClient(supabaseUrl, serviceRoleKey)
    const { data, error } = await admin
      .from('songs')
      .upsert(songs, { onConflict: 'spotify_id' })
      .select()

    if (error) {
      sendJson(res, { error: `Supabase upsert failed: ${error.message}` }, 500)
      return
    }

    sendJson(res, { songs: data as SongRow[], count: (data ?? []).length })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    sendJson(res, { error: message }, 502)
  }
}
