import { useEffect, useRef, useState } from 'react'
import { resolvePreview } from '../lib/catalog'
import type { LikedSong } from '../hooks/useLikedSongs'

// ─────────────────────────────────────────────────────────────────────────────
// LikedSongRow — one lined-paper row in the Liked Songs list
//
// WHAT: Title + artist on a single compact line, tappable to play the song's
//       30-second preview.
//
// WHY:  The Liked tab is a quick scan of what you've saved; rows stay light and
//       high-contrast (bold title, muted artist) rather than full cards.
//
// HOW:  Previews are resolved LAZILY — only when the row is first played — so the
//       list doesn't fire N network calls on mount. The parent owns which row is
//       active (`isActive`); when another row takes over, this one pauses. Deezer
//       tokens expire, so on an audio error we re-resolve once and retry, mirroring
//       SongCard.
// ─────────────────────────────────────────────────────────────────────────────

interface LikedSongRowProps {
  song: LikedSong
  /** True when this row is the one currently playing (parent-controlled). */
  isActive: boolean
  /** Ask the parent to make this row the active (sole) player. */
  onActivate: () => void
}

type Status = 'idle' | 'resolving' | 'ready' | 'unavailable'

export default function LikedSongRow({ song, isActive, onActivate }: LikedSongRowProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const retriedRef = useRef(false)
  const wantsPlayRef = useRef(false)
  const [status, setStatus] = useState<Status>('idle')
  const [isPlaying, setIsPlaying] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // Another row took over → stop ours.
  useEffect(() => {
    if (!isActive && isPlaying) audioRef.current?.pause()
  }, [isActive, isPlaying])

  // Once a fresh URL lands and the user still wants to play, start playback.
  useEffect(() => {
    if (previewUrl && wantsPlayRef.current) {
      void audioRef.current?.play().catch(() => setIsPlaying(false))
    }
  }, [previewUrl])

  async function resolveAndPlay() {
    setStatus('resolving')
    const url = await resolvePreview(song.spotifyId)
    if (url) {
      setPreviewUrl(url)
      setStatus('ready')
    } else {
      setStatus('unavailable')
    }
  }

  function handleClick() {
    if (status === 'unavailable') return
    if (isPlaying) {
      audioRef.current?.pause()
      return
    }
    wantsPlayRef.current = true
    onActivate()
    if (previewUrl) {
      void audioRef.current?.play().catch(() => setIsPlaying(false))
    } else {
      void resolveAndPlay()
    }
  }

  // Expired token (commonly a 403) → re-resolve once and retry.
  function handleError() {
    if (retriedRef.current) {
      setStatus('unavailable')
      return
    }
    retriedRef.current = true
    void resolveAndPlay()
  }

  return (
    <li>
      <button
        type="button"
        onClick={handleClick}
        disabled={status === 'unavailable'}
        aria-label={
          status === 'unavailable'
            ? `No preview for ${song.title}`
            : isPlaying
              ? `Pause ${song.title}`
              : `Play ${song.title}`
        }
        className="flex w-full items-center gap-3 border-b border-line py-3 text-left transition hover:bg-card/60 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {/* Play / pause / spinner glyph. */}
        <span className="flex h-6 w-6 shrink-0 items-center justify-center text-ink-soft">
          {status === 'resolving' ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink/20 border-t-ink" />
          ) : isPlaying ? (
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
              <path d="M7 5h3.2v14H7zM13.8 5H17v14h-3.2z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5 fill-current" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium text-ink" title={song.title}>
            {song.title}
          </span>
          <span className="block truncate text-sm italic text-ink-soft" title={song.artist}>
            {song.artist}
          </span>
        </span>
      </button>

      {previewUrl && (
        <audio
          ref={audioRef}
          src={previewUrl}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          onError={handleError}
        />
      )}
    </li>
  )
}
