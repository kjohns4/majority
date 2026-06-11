import { useEffect, useRef, useState } from 'react'
import { resolvePreview } from '../lib/catalog'
import type { Song, VoteValue } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// SongCard — the heart of Majority
//
// WHAT: Renders one song (album art, title, artist), a play/pause button for its
//       30-second preview, and Pass / Like vote buttons.
//
// WHY:  This is the core loop: listen, react, vote. Everything else (leaderboard,
//       nav) exists to support what happens on this card.
//
// HOW:  The parent owns the deck and renders us with key={song.id}, so changing
//       songs remounts this component — the <audio> element and all local state
//       reset for free, no cleanup effect needed.
//
//       Previews are the fiddly bit: Deezer's preview URLs are signed and expire
//       after ~15 minutes, so the one stored at seed time can't be trusted. We
//       resolve a FRESH url (via resolvePreview) when the card mounts, so play is
//       instant on click — and we re-resolve once if playback errors (e.g. the
//       token expired while the user lingered on the card).
// ─────────────────────────────────────────────────────────────────────────────

interface SongCardProps {
  song: Song
  /** Called with +1 (Like) or -1 (Pass) when the user votes. */
  onVote: (vote: VoteValue) => void
}

type PreviewStatus = 'resolving' | 'ready' | 'unavailable'

export default function SongCard({ song, onVote }: SongCardProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const retriedRef = useRef(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [hasPlayed, setHasPlayed] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // A null preview_url at seed time means the track had no preview at all; skip
  // the resolve and show the "no preview" state.
  const hadPreviewAtSeed = Boolean(song.previewUrl)
  const [status, setStatus] = useState<PreviewStatus>(
    hadPreviewAtSeed ? 'resolving' : 'unavailable',
  )

  // Resolve a fresh preview URL on mount (runs once per song thanks to the key).
  useEffect(() => {
    if (!hadPreviewAtSeed) return
    let cancelled = false
    void (async () => {
      const url = await resolvePreview(song.spotifyId)
      if (cancelled) return
      if (url) {
        setPreviewUrl(url)
        setStatus('ready')
      } else {
        setStatus('unavailable')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [song.spotifyId, hadPreviewAtSeed])

  function togglePlay() {
    const audio = audioRef.current
    if (!audio || status !== 'ready') return
    if (isPlaying) {
      audio.pause()
    } else {
      // play() rejects if the browser blocks autoplay; ignore so it never throws.
      void audio.play().catch(() => setIsPlaying(false))
    }
  }

  // If playback fails (commonly an expired token → 403), resolve a fresh URL once
  // and retry. Guarded by retriedRef so a persistent failure can't loop.
  function handleAudioError() {
    if (retriedRef.current) {
      setStatus('unavailable')
      return
    }
    retriedRef.current = true
    void (async () => {
      const url = await resolvePreview(song.spotifyId)
      const audio = audioRef.current
      if (url && audio) {
        setPreviewUrl(url)
        void audio.play().catch(() => setIsPlaying(false))
      } else {
        setStatus('unavailable')
      }
    })()
  }

  const monogram = song.title.trim().charAt(0).toUpperCase()
  // Voting is locked until the user has actually listened. Tracks with no preview
  // can't be played, so allow voting on those (you can't be asked to listen first).
  const canVote = hasPlayed || status === 'unavailable'

  return (
    <div className="w-full max-w-sm rounded-3xl bg-card p-6 shadow-[0_20px_60px_-30px_rgba(74,68,63,0.4)] ring-1 ring-line">
      {/* Album art (with a soft monogram placeholder if the URL is missing). */}
      <div className="relative mb-5 aspect-square w-full overflow-hidden rounded-2xl bg-inset">
        {song.albumArtUrl ? (
          <img
            src={song.albumArtUrl}
            alt={`${song.title} album art`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-6xl italic text-ink-soft/50">
            {monogram}
          </div>
        )}

        {/* Big play/pause control over the whole cover. Shows the pause icon while
            playing (and stays put), the play icon when paused. Hidden only when
            there's no preview at all. */}
        {status !== 'unavailable' && (
          <button
            type="button"
            onClick={togglePlay}
            disabled={status !== 'ready'}
            aria-label={
              status === 'resolving'
                ? 'Loading preview'
                : isPlaying
                  ? 'Pause preview'
                  : 'Play preview'
            }
            className="group absolute inset-0 flex items-center justify-center disabled:cursor-default"
          >
            {/* Soft veil — stronger when paused to invite a tap, fading once playing. */}
            <span
              className={
                'absolute inset-0 transition-colors ' +
                (isPlaying ? 'bg-black/10 group-hover:bg-black/20' : 'bg-black/25')
              }
            />
            {/* The badge itself. */}
            <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-card/85 text-ink shadow-lg ring-1 ring-line backdrop-blur-sm transition group-hover:bg-card">
              {status === 'resolving' ? (
                <span className="h-7 w-7 animate-spin rounded-full border-2 border-ink/20 border-t-ink" />
              ) : isPlaying ? (
                <svg viewBox="0 0 24 24" className="h-9 w-9 fill-current" aria-hidden="true">
                  <path d="M7 5h3.2v14H7zM13.8 5H17v14h-3.2z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="ml-1 h-9 w-9 fill-current" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </span>
          </button>
        )}
      </div>

      {/* Title + artist. truncate keeps long names on one tidy line. */}
      <h2 className="truncate text-2xl text-ink" title={song.title}>
        {song.title}
      </h2>
      <p className="truncate text-lg italic text-ink-soft" title={song.artist}>
        {song.artist}
      </p>

      {/* Status line: no-preview note, or a "listen first" nudge while locked. */}
      <p className="mt-1 h-5 text-sm italic text-ink-soft/80">
        {status === 'unavailable'
          ? 'No preview available — you can still vote.'
          : !canVote
            ? 'Press play to unlock voting.'
            : ''}
      </p>

      {/* Audio element; src is the freshly-resolved URL. */}
      {previewUrl && (
        <audio
          ref={audioRef}
          src={previewUrl}
          onPlay={() => {
            setIsPlaying(true)
            setHasPlayed(true)
          }}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          onError={handleAudioError}
        />
      )}

      {/* Vote buttons — locked until the user has listened. */}
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={() => onVote(-1)}
          disabled={!canVote}
          className="flex-1 rounded-2xl bg-sand py-3 text-lg tracking-wide text-ink ring-1 ring-line transition enabled:hover:bg-sand-deep disabled:cursor-not-allowed disabled:opacity-40"
        >
          Pass
        </button>
        <button
          type="button"
          onClick={() => onVote(1)}
          disabled={!canVote}
          className="flex-1 rounded-2xl bg-ink py-3 text-lg tracking-wide text-cream transition enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Like
        </button>
      </div>
    </div>
  )
}
