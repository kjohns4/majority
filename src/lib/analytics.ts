import { track } from '@vercel/analytics'
import type { View, VoteValue } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// analytics — typed custom events for Vercel Web Analytics
//
// WHAT: One function per event we care about, so event names + properties live
//       in one place (no stringly-typed track() calls scattered around).
//
// WHY:  Page views + referrers tell us where visitors come from; these events
//       tell us whether those visitors actually *engage* (listen, vote). In the
//       dashboard, filter Events by referrer/UTM to compare traffic sources.
//
// NOTE: Only small, non-identifying properties — no song ids or user ids.
//       track() is fire-and-forget and never throws into the UI.
// ─────────────────────────────────────────────────────────────────────────────

/** First play of a preview on a card or a Liked row. */
export function trackPreviewPlay(source: 'discover' | 'liked') {
  track('preview_play', { source })
}

/** A Pass or Like cast on the Discover deck. */
export function trackVote(vote: VoteValue) {
  track('vote', { choice: vote === 1 ? 'like' : 'pass' })
}

/** Switching tabs (Discover / Leaderboard / Liked). */
export function trackViewChange(view: View) {
  track('view_change', { view })
}
