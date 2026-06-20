import { useState } from 'react'
import LikedSongRow from '../components/LikedSongRow'
import { useLikedSongs } from '../hooks/useLikedSongs'

// ─────────────────────────────────────────────────────────────────────────────
// LikedSongsView — songs you've Liked, newest first
//
// WHAT: A scannable list of every song this browser has Liked, each playable.
//
// WHY:  Liking should feel like it goes somewhere. This is the personal flip side
//       of the public Leaderboard: not what the crowd picked, but what *you* did.
//
// HOW:  Reads the list from the localStorage-backed useLikedSongs hook (already
//       newest-first). We track which row is the active player here so only one
//       preview plays at a time. The empty state is honest about the MVP limit:
//       this list lives only in this browser.
// ─────────────────────────────────────────────────────────────────────────────

export default function LikedSongsView() {
  const likedSongs = useLikedSongs()
  const [activeId, setActiveId] = useState<string | null>(null)

  if (likedSongs.length === 0) {
    return (
      <div className="py-12 text-center text-ink-soft">
        <p className="text-2xl italic text-ink">Nothing liked yet.</p>
        <p className="mt-2 text-sm text-ink-soft/80">
          Like a song in Discover and it'll show up here.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <ul className="border-t border-line">
        {likedSongs.map((song) => (
          <LikedSongRow
            key={song.songId}
            song={song}
            isActive={activeId === song.songId}
            onActivate={() => setActiveId(song.songId)}
          />
        ))}
      </ul>
      <p className="mt-6 text-center text-xs tracking-wide text-ink-soft/60">
        Saved on this device only — clearing your browser data clears this list.
      </p>
    </div>
  )
}
