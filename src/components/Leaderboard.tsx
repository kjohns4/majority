import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { songFromRow, type LeaderboardEntry, type SongRow } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// Leaderboard — what the crowd actually likes
//
// WHAT: Top 10 songs ranked by score (upvotes minus downvotes), updating live.
//
// WHY:  This is the payoff of voting and the whole pitch of Majority: results
//       come from real people, not an algorithm. Seeing it move in real time is
//       what makes that tangible.
//
// HOW:  We pull every vote (song_id, vote) plus all songs, tally up/down per song
//       in JS, sort by score, and keep the top 10. We refresh on two triggers:
//         1. A Supabase Realtime subscription to INSERTs on `votes`.
//         2. A polling interval, as a fallback in case Realtime replication
//            isn't enabled on the table yet.
//       Aggregating client-side keeps the MVP simple (no SQL view/RPC needed);
//       at MVP vote volumes this is perfectly fine.
// ─────────────────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 8000
const TOP_N = 10

export default function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      // Songs + votes in parallel.
      const [songsRes, votesRes] = await Promise.all([
        supabase.from('songs').select('*'),
        supabase.from('votes').select('song_id, vote'),
      ])

      if (songsRes.error) throw new Error(songsRes.error.message)
      if (votesRes.error) throw new Error(votesRes.error.message)

      const songs = (songsRes.data as SongRow[]).map(songFromRow)
      const votes = (votesRes.data as { song_id: string; vote: number }[]) ?? []

      // Tally up/down per song id.
      const tally = new Map<string, { up: number; down: number }>()
      for (const v of votes) {
        const t = tally.get(v.song_id) ?? { up: 0, down: 0 }
        if (v.vote > 0) t.up += 1
        else t.down += 1
        tally.set(v.song_id, t)
      }

      const ranked: LeaderboardEntry[] = songs
        .map((song) => {
          const t = tally.get(song.id) ?? { up: 0, down: 0 }
          return {
            song,
            upvotes: t.up,
            downvotes: t.down,
            score: t.up - t.down,
          }
        })
        // Only show songs that have received at least one vote.
        .filter((e) => e.upvotes + e.downvotes > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, TOP_N)

      setEntries(ranked)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leaderboard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Initial fetch. load() is async, so its setState calls run after an await
    // (not synchronously in the effect) — the experimental rule can't see that.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()

    // Realtime: refresh whenever a vote is inserted.
    const channel = supabase
      .channel('votes-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'votes' },
        () => void load(),
      )
      .subscribe()

    // Polling fallback in case Realtime isn't enabled on the votes table.
    const interval = setInterval(() => void load(), POLL_INTERVAL_MS)

    return () => {
      void supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [load])

  if (loading) {
    return (
      <p className="py-12 text-center italic text-ink-soft">
        Loading leaderboard…
      </p>
    )
  }

  if (error) {
    return <p className="py-12 text-center italic text-ink-soft">Error: {error}</p>
  }

  if (entries.length === 0) {
    return (
      <p className="py-12 text-center italic text-ink-soft">
        No votes yet — go vote on some songs to start the leaderboard.
      </p>
    )
  }

  return (
    <ol className="mx-auto flex w-full max-w-xl flex-col gap-3">
      {entries.map((entry, index) => (
        <li
          key={entry.song.id}
          className="flex items-center gap-4 rounded-2xl bg-card p-3 ring-1 ring-line"
        >
          <span className="w-8 shrink-0 text-center text-2xl italic text-ink-soft">
            {index + 1}
          </span>
          {entry.song.albumArtUrl ? (
            <img
              src={entry.song.albumArtUrl}
              alt=""
              className="h-12 w-12 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-inset text-xl italic text-ink-soft/50">
              {entry.song.title.trim().charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg text-ink">{entry.song.title}</p>
            <p className="truncate text-sm italic text-ink-soft">
              {entry.song.artist}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}
