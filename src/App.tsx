import { useState } from 'react'
import Navigation from './components/Navigation'
import CardView from './pages/CardView'
import LeaderboardView from './pages/LeaderboardView'
import type { View } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// App — top-level shell
//
// WHAT: Renders the header, the Discover/Leaderboard toggle, and whichever page
//       is active.
//
// WHY:  One place owns the single piece of cross-screen state (which view is
//       showing) and passes it down. Simple, no router needed for two screens.
// ─────────────────────────────────────────────────────────────────────────────

function App() {
  const [view, setView] = useState<View>('discover')

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col px-4 py-12">
      <header className="mb-8 text-center">
        <h1 className="text-5xl font-medium italic tracking-tight text-ink">
          Majority
        </h1>
        <p className="mt-1 text-xl italic text-ink-soft">Your choice</p>
      </header>

      <Navigation view={view} onChange={setView} />

      <main className="flex-1">
        {view === 'discover' ? <CardView /> : <LeaderboardView />}
      </main>

      <footer className="mt-12 text-center text-xs tracking-wide text-ink-soft/60">
        vote wisely
      </footer>
    </div>
  )
}

export default App
