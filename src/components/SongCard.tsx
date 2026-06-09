import { useRef, useState } from 'react'
import type { Song, VoteValue } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// SongCard — the heart of Majority
//
// WHAT: Renders one song (album art, title, artist), a play/pause button for its
//       30-second preview, and 👍 / 👎 vote buttons.
//
// WHY:  This is the core loop: listen, react, vote. Everything else (leaderboard,
//       nav) exists to support what happens on this card.
//
// HOW:  The parent owns the deck and tells us which song to show via props, plus
//       an onVote callback. We own only the small, local concern of audio
//       playback (an HTML5 <audio> element driven through a ref). When the song
//       prop changes we stop and reset playback so the previous clip never bleeds
//       into the next card.
// ─────────────────────────────────────────────────────────────────────────────

interface SongCardProps {
  song: Song
  /** Called with +1 (👍) or -1 (👎) when the user votes. */
  onVote: (vote: VoteValue) => void
}

export default function SongCard({ song, onVote }: SongCardProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  // Note: the parent renders this card with key={song.id}, so changing songs
  // remounts the component — that resets the <audio> element and isPlaying for
  // free, so there's no effect needed to stop a previous clip bleeding through.
  const hasPreview = Boolean(song.previewUrl)

  function togglePlay() {
    const audio = audioRef.current
    if (!audio || !hasPreview) return
    if (isPlaying) {
      audio.pause()
    } else {
      // play() returns a promise that rejects if the browser blocks autoplay;
      // ignore the rejection so a denied play never throws into the UI.
      void audio.play().catch(() => setIsPlaying(false))
    }
  }

  return (
    <div className="w-full max-w-sm rounded-3xl bg-white/5 p-6 shadow-2xl ring-1 ring-white/10 backdrop-blur">
      {/* Album art (with a graceful placeholder if the URL is missing). */}
      <div className="relative mb-5 aspect-square w-full overflow-hidden rounded-2xl bg-white/10">
        {song.albumArtUrl ? (
          <img
            src={song.albumArtUrl}
            alt={`${song.title} album art`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-5xl">
            🎵
          </div>
        )}

        {/* Play / pause overlay button. */}
        <button
          type="button"
          onClick={togglePlay}
          disabled={!hasPreview}
          aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
          className="absolute bottom-3 right-3 flex h-14 w-14 items-center justify-center rounded-full bg-fuchsia-500 text-2xl text-white shadow-lg transition hover:bg-fuchsia-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
      </div>

      {/* Title + artist. truncate keeps long names on one tidy line. */}
      <h2 className="truncate text-xl font-semibold text-white" title={song.title}>
        {song.title}
      </h2>
      <p className="mb-1 truncate text-white/60" title={song.artist}>
        {song.artist}
      </p>

      {!hasPreview && (
        <p className="mb-3 text-sm text-amber-400/80">
          No 30-sec preview available — you can still vote.
        </p>
      )}

      {/* Hidden audio element; controlled entirely via the ref above. */}
      {hasPreview && (
        <audio
          ref={audioRef}
          src={song.previewUrl ?? undefined}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      {/* Vote buttons. */}
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={() => onVote(-1)}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white/10 py-3 text-lg font-medium text-white transition hover:bg-rose-500/80"
        >
          👎 <span>Nah</span>
        </button>
        <button
          type="button"
          onClick={() => onVote(1)}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white/10 py-3 text-lg font-medium text-white transition hover:bg-emerald-500/80"
        >
          👍 <span>Fire</span>
        </button>
      </div>
    </div>
  )
}
