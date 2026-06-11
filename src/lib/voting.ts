import { supabase } from './supabase'
import type { VoteValue } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// Voting
//
// WHAT: `castVote(songId, vote)` writes one row to the Supabase `votes` table:
//       which song, +1 or -1, and an anonymized identity hash.
//
// WHY:  Votes are the whole point — they power the leaderboard. We want them to
//       count without forcing anyone to sign up, so voting is anonymous. The
//       `ip_hash` column exists to make casual double-voting harder while keeping
//       voters anonymous.
//
// HOW:  For the MVP we derive the hash from a random per-browser id (stored in
//       localStorage) rather than the real client IP. The browser can't read its
//       own public IP, and true IP hashing needs a server round-trip; a stable
//       browser id is a reasonable day-1 stand-in that lives in the same column.
//       We SHA-256 it via the Web Crypto API so no raw identifier is ever stored.
//
// GOTCHA: This is intentionally "good enough, not perfect" (see CLAUDE.md):
//         clearing storage or switching browsers lets someone vote again. Real
//         abuse prevention (server-side IP hashing or auth) is a v2 concern.
// ─────────────────────────────────────────────────────────────────────────────

const VOTER_ID_KEY = 'majority:voter-id'
const VOTED_SONGS_KEY = 'majority:voted-song-ids'

/** Returns a stable random id for this browser, creating one on first use. */
function getOrCreateVoterId(): string {
  let id = localStorage.getItem(VOTER_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(VOTER_ID_KEY, id)
  }
  return id
}

/** SHA-256 hex of the input — used to anonymize the voter id before storage. */
async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Song ids this browser has already voted on (local quick-check). */
function getLocallyVotedSongIds(): Set<string> {
  try {
    const raw = localStorage.getItem(VOTED_SONGS_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function rememberVotedSong(songId: string): void {
  const voted = getLocallyVotedSongIds()
  voted.add(songId)
  localStorage.setItem(VOTED_SONGS_KEY, JSON.stringify([...voted]))
}

/** True if this browser already recorded a vote for the song. */
export function hasVotedLocally(songId: string): boolean {
  return getLocallyVotedSongIds().has(songId)
}

/**
 * Records a vote. Validates inputs, skips if this browser already voted on the
 * song, then inserts {song_id, vote, ip_hash} via the anon client (allowed by
 * the votes INSERT RLS policy).
 */
export async function castVote(songId: string, vote: VoteValue): Promise<void> {
  // Validate before touching the network — the FK + RLS will also reject bad
  // data, but failing fast here is cheaper and clearer.
  if (!songId) throw new Error('castVote: missing songId')
  if (vote !== 1 && vote !== -1) throw new Error('castVote: vote must be 1 or -1')

  if (hasVotedLocally(songId)) return

  const ipHash = await sha256Hex(getOrCreateVoterId())

  const { error } = await supabase
    .from('votes')
    .insert({ song_id: songId, vote, ip_hash: ipHash })

  if (error) {
    throw new Error(`Failed to record vote: ${error.message}`)
  }

  rememberVotedSong(songId)
}
