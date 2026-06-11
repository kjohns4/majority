import Leaderboard from '../components/Leaderboard'

// LeaderboardView — thin page wrapper around the Leaderboard component.
// Kept as its own page so App treats both screens symmetrically and there's an
// obvious home for any leaderboard-specific page chrome (filters, time ranges)
// added later.
export default function LeaderboardView() {
  return (
    <section>
      <h2 className="mb-1 text-center text-3xl italic text-ink">
        weekly global leaders
      </h2>
      <p className="mb-8 text-center text-sm italic text-ink-soft">
        rankings are determined by user votes
      </p>
      <Leaderboard />
    </section>
  )
}
