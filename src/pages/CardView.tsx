import { useEffect, useMemo, useState } from 'react'
import SongCard from '../components/SongCard'
import { fetchEmergingSongs } from '../lib/spotify'
import { castVote, hasVotedLocally } from '../lib/voting'
import type { Song, VoteValue } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// CardView — the Discover screen / deck manager
//
// WHAT: Loads the song deck and shows one card at a time. Handles a vote by
//       persisting it, then advancing to the next song.
//
// WHY:  SongCard renders a single song; something has to own the *deck* — which
//       songs, which one is current, what happens after a vote. That's this page.
//
// HOW:  On mount we fetch songs and drop any this browser already voted on, so
//       the user doesn't re-rate the same track. State is just the song list +
//       the current index. Voting fires castVote() optimistically (we advance
//       immediately; a failed write is logged, not blocking — the leaderboard is
//       eventually consistent and a single dropped vote isn't worth stalling UX).
// ─────────────────────────────────────────────────────────────────────────────

export default function CardView() {
  const [songs, setSongs] = useState<Song[]>([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const all = await fetchEmergingSongs()
        if (cancelled) return
        // Skip songs already voted on in this browser.
        setSongs(all.filter((s) => !hasVotedLocally(s.id)))
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load songs')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const currentSong = useMemo(() => songs[index], [songs, index])

  function handleVote(vote: VoteValue) {
    if (!currentSong) return
    // Persist in the background; advance the UI right away.
    void castVote(currentSong.id, vote).catch((err) => {
      console.error('Vote failed:', err)
    })
    setIndex((i) => i + 1)
  }

  if (loading) {
    return <p className="py-10 text-center text-white/50">Loading songs…</p>
  }

  if (error) {
    return (
      <div className="py-10 text-center text-rose-400">
        <p>Couldn't load songs: {error}</p>
        <p className="mt-2 text-sm text-white/40">
          Make sure the songs table is seeded (see README).
        </p>
      </div>
    )
  }

  // Reached the end of the deck (or there were no songs to begin with).
  if (!currentSong) {
    return (
      <div className="py-10 text-center text-white/60">
        <p className="text-lg">🎉 That's everything for now!</p>
        <p className="mt-2 text-sm text-white/40">
          Check the Leaderboard to see what the crowd picked.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center">
      {/* key={song.id} remounts the card per song, resetting its audio player. */}
      <SongCard key={currentSong.id} song={currentSong} onVote={handleVote} />
      <p className="mt-4 text-sm text-white/40">
        {index + 1} of {songs.length}
      </p>
    </div>
  )
}
