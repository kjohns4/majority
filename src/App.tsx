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
    <div className="mx-auto flex min-h-full max-w-2xl flex-col px-4 py-8">
      <header className="mb-6 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight text-white">
          Majority
        </h1>
        <p className="text-sm text-white/50">
          Music discovery by real people — vote, don't algorithm.
        </p>
      </header>

      <Navigation view={view} onChange={setView} />

      <main className="flex-1">
        {view === 'discover' ? <CardView /> : <LeaderboardView />}
      </main>

      <footer className="mt-10 text-center text-xs text-white/30">
        Built with real votes · Deezer previews · Supabase
      </footer>
    </div>
  )
}

export default App
