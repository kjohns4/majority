import Leaderboard from '../components/Leaderboard'

// LeaderboardView — thin page wrapper around the Leaderboard component.
// Kept as its own page so App treats both screens symmetrically and there's an
// obvious home for any leaderboard-specific page chrome (filters, time ranges)
// added later.
export default function LeaderboardView() {
  return (
    <section>
      <h2 className="mb-1 text-center text-2xl font-bold text-white">
        Top of the crowd
      </h2>
      <p className="mb-6 text-center text-sm text-white/40">
        Ranked by real votes, updating live.
      </p>
      <Leaderboard />
    </section>
  )
}
