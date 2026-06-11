// Shared types for Majority. Keeping them in one place means the Supabase
// queries, Spotify fetch layer, and React components all speak the same shape.

/**
 * A song as stored in the Supabase `songs` table and rendered in the UI.
 * `id` is the Supabase UUID primary key (what votes reference). `spotifyId`
 * is the external provider track id used for de-duplication (currently the
 * Deezer track id; the DB column is named `spotify_id` for historical reasons).
 */
export interface Song {
  id: string
  spotifyId: string
  title: string
  artist: string
  albumArtUrl: string
  /** 30-second MP3 preview. May be null — not every track exposes one. */
  previewUrl: string | null
  createdAt: string
}

/** A single vote: +1 (Like) or -1 (Pass). */
export type VoteValue = 1 | -1

/**
 * One row in the leaderboard: a song plus its aggregated vote tallies.
 * `score` is upvotes minus downvotes (what we sort the leaderboard by).
 */
export interface LeaderboardEntry {
  song: Song
  upvotes: number
  downvotes: number
  score: number
}

/** The two top-level screens the user can navigate between. */
export type View = 'discover' | 'leaderboard'

/**
 * Raw row shape returned by Supabase for the `songs` table (snake_case).
 * We map this into the camelCase `Song` used everywhere else in the app.
 */
export interface SongRow {
  id: string
  spotify_id: string
  title: string
  artist: string
  album_art_url: string
  preview_url: string | null
  created_at: string
}

/** Maps a snake_case DB row into the camelCase `Song` used in the UI. */
export function songFromRow(row: SongRow): Song {
  return {
    id: row.id,
    spotifyId: row.spotify_id,
    title: row.title,
    artist: row.artist,
    albumArtUrl: row.album_art_url,
    previewUrl: row.preview_url,
    createdAt: row.created_at,
  }
}
