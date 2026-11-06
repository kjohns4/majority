import { useState } from 'react'
import { Analytics } from '@vercel/analytics/react'
import Navigation from './components/Navigation'
import CardView from './pages/CardView'
import LeaderboardView from './pages/LeaderboardView'
import LikedSongsView from './pages/LikedSongsView'
import type { View } from './types'
import { trackViewChange } from './lib/analytics'

// ─────────────────────────────────────────────────────────────────────────────
// App — top-level shell
//
// WHAT: Renders the header, the Discover / Leaderboard / Liked toggle, and
//       whichever page is active.
//
// WHY:  One place owns the single piece of cross-screen state (which view is
//       showing) and passes it down. Simple, no router needed for a few screens.
// ─────────────────────────────────────────────────────────────────────────────

function App() {
  const [view, setView] = useState<View>('discover')

  function changeView(next: View) {
    if (next !== view) trackViewChange(next)
    setView(next)
  }

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col px-4 py-12">
      <header className="mb-8 text-center">
        <h1 className="text-5xl font-medium italic tracking-tight text-ink">
          Majority
        </h1>
        <p className="mt-1 text-xl italic text-ink-soft">Your choice</p>
      </header>

      <Navigation view={view} onChange={changeView} />

      <main className="flex-1">
        {view === 'discover' && <CardView />}
        {view === 'leaderboard' && <LeaderboardView />}
        {view === 'liked' && <LikedSongsView />}
      </main>

      <footer className="mt-12 text-center text-xs tracking-wide text-ink-soft/60">
        <p>rankings determined by you</p>
        <p className="mt-2">
          Feature request or bug?{' '}
          <a
            href="mailto:majority8app@proton.me?subject=Majority%20feature%20request%20or%20bug"
            className="underline underline-offset-2 transition hover:text-ink"
          >
            majority8app@proton.me
          </a>
        </p>
      </footer>

      <Analytics />
    </div>
  )
}

export default App
