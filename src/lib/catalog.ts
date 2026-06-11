import { supabase } from './supabase'
import { songFromRow, type Song, type SongRow } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// Catalog (frontend side)
//
// WHAT: `fetchEmergingSongs()` returns the list of songs to swipe through.
//
// WHY:  The browser never seeds the catalog itself — writing to the read-only
//       `songs` table needs the service-role key, which must stay server side.
//       This file is the thin client-side door to that flow.
//
// HOW:  Primary path: GET /api/songs (fetches fresh tracks from Deezer + upserts
//       + returns rows). Fallback path: if that endpoint isn't running (e.g.
//       plain `npm run dev` with no serverless functions), read whatever songs
//       are already in Supabase so the UI still has something to show.
// ─────────────────────────────────────────────────────────────────────────────

/** Reads already-seeded songs straight from Supabase (anon, read-only). */
async function readSeededSongs(): Promise<Song[]> {
  const { data, error } = await supabase
    .from('songs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    throw new Error(`Could not read songs from Supabase: ${error.message}`)
  }
  return (data as SongRow[]).map(songFromRow)
}

/**
 * Returns ~50 songs. Tries the server endpoint first (which refreshes the
 * catalog from Deezer), then falls back to whatever is already stored.
 */
export async function fetchEmergingSongs(): Promise<Song[]> {
  try {
    const res = await fetch('/api/songs')
    // In plain `vite dev` there's no function, so the dev server returns the
    // index.html (200, text/html). Guard on the content type, not just res.ok.
    const contentType = res.headers.get('content-type') ?? ''
    if (res.ok && contentType.includes('application/json')) {
      const body = (await res.json()) as { songs?: SongRow[]; error?: string }
      if (body.error) throw new Error(body.error)
      if (body.songs && body.songs.length > 0) {
        return body.songs.map(songFromRow)
      }
    }
  } catch {
    // Swallow and fall through to the Supabase fallback below.
  }

  return readSeededSongs()
}
