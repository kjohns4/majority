import { useCallback, useEffect, useState } from 'react'
import type { Song } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// useLikedSongs — the user's private "Liked Songs" list, kept in localStorage
//
// WHAT: A compact, newest-first list of the songs this browser has Liked. Each
//       entry is a self-contained snapshot so the Liked tab renders with zero
//       network calls.
//
// WHY:  Liking should feel instant and personal without requiring accounts. The
//       MVP has no auth, so we persist locally. The trade-off (clearing the cache
//       loses the list) is acceptable for day one — the UI says so honestly.
//
// HOW:  We denormalize the few fields the list needs ({songId, title, artist,
//       albumArtUrl, likedAt}) into one JSON array under `majority:liked-songs`.
//       Preview URLs are deliberately NOT stored — they're signed and expire
//       (~15 min), so rows resolve a fresh one at play time, just like SongCard.
//
// GOTCHA: localStorage is user-writable → untrusted. Every read is wrapped in a
//         try/catch and validated, dropping anything malformed rather than
//         throwing. Writes also broadcast a `storage`-like event so a mounted
//         Liked view in the same tab can update live.
// ─────────────────────────────────────────────────────────────────────────────

const LIKED_SONGS_KEY = 'majority:liked-songs'
/** Fired in-tab after a write (the native `storage` event only fires cross-tab). */
const LIKED_SONGS_EVENT = 'majority:liked-songs-changed'

/** A denormalized snapshot of a liked song — everything the Liked tab needs. */
export interface LikedSong {
  songId: string
  /** Deezer track id — needed to resolve a fresh preview URL at play time. */
  spotifyId: string
  title: string
  artist: string
  albumArtUrl: string
  /** ISO timestamp of when it was liked; the list sorts by this, newest first. */
  likedAt: string
}

/** Narrows an unknown parsed value to a well-formed LikedSong. */
function isLikedSong(value: unknown): value is LikedSong {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.songId === 'string' &&
    typeof v.spotifyId === 'string' &&
    typeof v.title === 'string' &&
    typeof v.artist === 'string' &&
    typeof v.albumArtUrl === 'string' &&
    typeof v.likedAt === 'string'
  )
}

/** Reads + validates the liked list, newest first. Never throws. */
export function readLikedSongs(): LikedSong[] {
  try {
    const raw = localStorage.getItem(LIKED_SONGS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(isLikedSong)
      .sort((a, b) => b.likedAt.localeCompare(a.likedAt))
  } catch {
    return []
  }
}

/**
 * Records a Like. De-dupes by songId (re-liking refreshes the snapshot and bumps
 * it to the top) and notifies any mounted listeners in this tab.
 */
export function addLikedSong(song: Song): void {
  const entry: LikedSong = {
    songId: song.id,
    spotifyId: song.spotifyId,
    title: song.title,
    artist: song.artist,
    albumArtUrl: song.albumArtUrl,
    likedAt: new Date().toISOString(),
  }
  const next = [entry, ...readLikedSongs().filter((s) => s.songId !== song.id)]
  try {
    localStorage.setItem(LIKED_SONGS_KEY, JSON.stringify(next))
    window.dispatchEvent(new Event(LIKED_SONGS_EVENT))
  } catch {
    // Storage full or unavailable (e.g. private mode): liking just doesn't persist.
  }
}

/** Subscribes to the liked list, refreshing on writes from this or another tab. */
export function useLikedSongs(): LikedSong[] {
  const [liked, setLiked] = useState<LikedSong[]>(() => readLikedSongs())

  const refresh = useCallback(() => setLiked(readLikedSongs()), [])

  useEffect(() => {
    // Initial value already comes from the useState initializer; here we only
    // subscribe to later writes (this tab via our custom event, other tabs via
    // the native storage event).
    window.addEventListener(LIKED_SONGS_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(LIKED_SONGS_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [refresh])

  return liked
}
